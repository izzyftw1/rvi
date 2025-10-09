-- Update work order ID generation to use SO prefix instead of ISO
-- This affects the auto_generate_work_order_from_line_item trigger

CREATE OR REPLACE FUNCTION public.auto_generate_work_order_from_line_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_wo_id text;
  new_wo_uuid uuid;
  so_record record;
BEGIN
  -- Only generate WO when status changes to 'approved'
  IF (TG_OP = 'UPDATE' AND OLD.status != 'approved' AND NEW.status = 'approved' AND NEW.work_order_id IS NULL) THEN
    
    -- Get sales order details
    SELECT * INTO so_record FROM sales_orders WHERE id = NEW.sales_order_id;
    
    -- Generate WO ID: SO-[CustomerPO]-[LineNumber] (e.g., SO-12345-001)
    new_wo_id := 'SO-' || so_record.po_number || '-' || LPAD(NEW.line_number::text, 3, '0');
    
    -- Insert new work order with financial snapshot
    INSERT INTO work_orders (
      wo_id,
      display_id,
      customer,
      customer_po,
      item_code,
      quantity,
      due_date,
      sales_order,
      so_id,
      status,
      current_stage,
      gross_weight_per_pc,
      net_weight_per_pc,
      material_size_mm,
      cycle_time_seconds,
      financial_snapshot
    ) VALUES (
      gen_random_uuid(),
      new_wo_id,
      so_record.customer,
      so_record.po_number,
      NEW.item_code,
      NEW.quantity,
      NEW.due_date,
      so_record.so_id,
      NEW.sales_order_id,
      'pending',
      'goods_in',
      NEW.gross_weight_per_pc_grams,
      NEW.net_weight_per_pc_grams,
      NEW.material_size_mm,
      NEW.cycle_time_seconds,
      jsonb_build_object(
        'currency', so_record.currency,
        'payment_terms_days', so_record.payment_terms_days,
        'incoterm', so_record.incoterm,
        'so_total', so_record.total_value,
        'line_item', jsonb_build_object(
          'item_code', NEW.item_code,
          'quantity', NEW.quantity,
          'price_per_pc', NEW.price_per_pc,
          'line_amount', NEW.line_amount,
          'due_date', NEW.due_date,
          'drawing_number', NEW.drawing_number,
          'alloy', NEW.alloy,
          'material_size_mm', NEW.material_size_mm
        )
      )
    ) RETURNING id INTO new_wo_uuid;
    
    -- Update the line item with the work order UUID
    UPDATE sales_order_line_items
    SET work_order_id = new_wo_uuid
    WHERE id = NEW.id;
    
    -- Log the WO generation
    RAISE NOTICE 'Generated Work Order % for line item % of SO %', new_wo_id, NEW.line_number, so_record.so_id;
    
  END IF;
  
  RETURN NEW;
END;
$function$;