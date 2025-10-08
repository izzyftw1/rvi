-- Drop all triggers first
DROP TRIGGER IF EXISTS trigger_update_item_master ON sales_orders;
DROP TRIGGER IF EXISTS trigger_update_masters_from_sales_order ON sales_orders;

-- Now drop the function with CASCADE to remove any remaining dependencies
DROP FUNCTION IF EXISTS update_item_master_from_sales_order() CASCADE;

-- Create new function to update item and customer master from line items
CREATE OR REPLACE FUNCTION public.update_masters_from_line_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  so_record record;
BEGIN
  -- Get sales order details
  SELECT * INTO so_record FROM sales_orders WHERE id = NEW.sales_order_id;
  
  -- Update or insert item data from line item
  INSERT INTO public.item_master (
    item_code, 
    alloy, 
    material_size_mm, 
    gross_weight_grams, 
    net_weight_grams, 
    cycle_time_seconds,
    last_used
  ) VALUES (
    NEW.item_code,
    NEW.alloy,
    NEW.material_size_mm,
    NEW.gross_weight_per_pc_grams,
    NEW.net_weight_per_pc_grams,
    NEW.cycle_time_seconds,
    now()
  )
  ON CONFLICT (item_code) 
  DO UPDATE SET
    alloy = EXCLUDED.alloy,
    material_size_mm = EXCLUDED.material_size_mm,
    gross_weight_grams = EXCLUDED.gross_weight_grams,
    net_weight_grams = EXCLUDED.net_weight_grams,
    cycle_time_seconds = EXCLUDED.cycle_time_seconds,
    last_used = now(),
    updated_at = now();
  
  -- Update or insert customer data (only on first line item insert)
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.customer_master (
      customer_name,
      party_code,
      last_used
    ) VALUES (
      so_record.customer,
      so_record.party_code,
      now()
    )
    ON CONFLICT (customer_name)
    DO UPDATE SET
      party_code = COALESCE(EXCLUDED.party_code, customer_master.party_code),
      last_used = now(),
      updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger on line items instead of sales orders
CREATE TRIGGER trigger_update_masters_from_line_item
  AFTER INSERT ON sales_order_line_items
  FOR EACH ROW
  EXECUTE FUNCTION update_masters_from_line_item();