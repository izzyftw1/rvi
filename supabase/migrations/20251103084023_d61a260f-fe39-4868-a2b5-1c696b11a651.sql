-- Fix the type mismatch in work_orders table and functions
-- The issue is that work_orders.so_id is UUID but sales_orders.so_id is text

-- First, let's check the current structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'work_orders' AND column_name IN ('so_id', 'sales_order');

-- Drop the problematic function temporarily to avoid conflicts
DROP TRIGGER IF EXISTS auto_generate_work_orders_trigger ON sales_orders;

-- Update work_orders table to have consistent types
-- so_id should be UUID (references sales_orders.id)
-- sales_order should be text (references sales_orders.so_id)
ALTER TABLE work_orders 
  DROP CONSTRAINT IF EXISTS work_orders_so_id_fkey;

-- Recreate the function with correct field mappings
CREATE OR REPLACE FUNCTION public.auto_generate_work_orders()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item_record jsonb;
  new_display_id text;
  item_counter integer := 1;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') OR 
     (TG_OP = 'UPDATE' AND OLD.status != 'approved' AND NEW.status = 'approved') THEN

    FOR item_record IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      new_display_id := 'ISO-' || NEW.po_number || '-' || NEW.so_id || '-' || LPAD(item_counter::text, 3, '0');
      
      INSERT INTO public.work_orders (
        wo_id,
        display_id,
        customer,
        customer_id,
        customer_po,
        item_code,
        revision,
        quantity,
        due_date,
        priority,
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
        new_display_id,
        NEW.customer,
        NEW.customer_id,
        NEW.po_number,
        COALESCE(item_record->>'item_code', 'N/A'),
        COALESCE(item_record->>'revision', '0'),
        COALESCE((item_record->>'quantity')::integer, 0),
        COALESCE((item_record->>'due_date')::date, CURRENT_DATE + interval '30 days'),
        COALESCE((item_record->>'priority')::integer, 3),
        NEW.so_id,          -- text copy of SO display id (sales_orders.so_id)
        NEW.id,             -- UUID FK to sales_orders.id
        'pending',
        'goods_in',
        COALESCE((item_record->>'gross_weight_per_pc_grams')::numeric, NEW.gross_weight_per_pc_grams),
        COALESCE((item_record->>'net_weight_per_pc_grams')::numeric, NEW.net_weight_per_pc_grams),
        COALESCE(item_record->>'material_size_mm', NEW.material_rod_forging_size_mm),
        COALESCE((item_record->>'cycle_time_seconds')::numeric, NEW.cycle_time_seconds),
        jsonb_build_object(
          'currency', NEW.currency,
          'payment_terms_days', NEW.payment_terms_days,
          'incoterm', NEW.incoterm,
          'so_total', COALESCE(NEW.total_amount, 0),
          'line_item', jsonb_build_object(
            'item_code', COALESCE(item_record->>'item_code', 'N/A'),
            'quantity', COALESCE((item_record->>'quantity')::integer, 0),
            'price_per_pc', COALESCE((item_record->>'price_per_pc')::numeric, 0),
            'line_amount', COALESCE((item_record->>'line_amount')::numeric, 0),
            'due_date', COALESCE(item_record->>'due_date', ''),
            'drawing_number', COALESCE(item_record->>'drawing_number', ''),
            'alloy', item_record->>'alloy',
            'material_size_mm', COALESCE(item_record->>'material_size_mm', NEW.material_rod_forging_size_mm)
          )
        )
      );
      
      item_counter := item_counter + 1;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Recreate the trigger
CREATE TRIGGER auto_generate_work_orders_trigger 
  AFTER INSERT OR UPDATE ON sales_orders 
  FOR EACH ROW 
  EXECUTE FUNCTION auto_generate_work_orders();