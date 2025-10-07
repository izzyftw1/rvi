-- Update the auto-generation function to use simplified WO ID format
CREATE OR REPLACE FUNCTION public.auto_generate_work_order_from_line_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_wo_id text;
  so_record record;
BEGIN
  -- Only generate WO when status changes to 'approved'
  IF (TG_OP = 'UPDATE' AND OLD.status != 'approved' AND NEW.status = 'approved' AND NEW.work_order_id IS NULL) THEN
    
    -- Get sales order details
    SELECT * INTO so_record FROM sales_orders WHERE id = NEW.sales_order_id;
    
    -- Generate WO ID: ISO-[CustomerPO]-[LineNumber] (e.g., ISO-72823-001)
    new_wo_id := 'ISO-' || so_record.po_number || '-' || LPAD(NEW.line_number::text, 3, '0');
    
    -- Insert new work order with line item-specific details
    INSERT INTO work_orders (
      wo_id,
      display_id,
      customer,
      customer_po,
      item_code,
      quantity,
      due_date,
      priority,
      sales_order,
      status,
      current_stage,
      gross_weight_per_pc,
      net_weight_per_pc,
      material_size_mm,
      cycle_time_seconds
    ) VALUES (
      gen_random_uuid(),
      new_wo_id,
      so_record.customer,
      so_record.po_number,
      NEW.item_code,
      NEW.quantity,
      NEW.due_date,
      NEW.priority,
      NEW.sales_order_id,
      'pending',
      'goods_in',
      NEW.gross_weight_per_pc_grams,
      NEW.net_weight_per_pc_grams,
      NEW.material_size_mm,
      NEW.cycle_time_seconds
    ) RETURNING id INTO NEW.work_order_id;
    
    -- Log the WO generation
    RAISE NOTICE 'Generated Work Order % for line item % of SO %', new_wo_id, NEW.line_number, so_record.so_id;
    
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_auto_generate_wo_from_line_item ON sales_order_line_items;

-- Create trigger on sales_order_line_items table
CREATE TRIGGER trigger_auto_generate_wo_from_line_item
  AFTER UPDATE ON sales_order_line_items
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_work_order_from_line_item();

COMMENT ON TRIGGER trigger_auto_generate_wo_from_line_item ON sales_order_line_items IS 
'Automatically generates a Work Order when a line item is approved. Format: ISO-[PO]-[LineNo]';