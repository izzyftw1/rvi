-- Fix auto_generate_work_orders to use total_amount instead of total_value
CREATE OR REPLACE FUNCTION public.auto_generate_work_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  item_record jsonb;
  new_display_id text;
  item_counter integer := 1;
BEGIN
  -- Only generate WOs when status changes to 'approved'
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') OR 
     (TG_OP = 'UPDATE' AND OLD.status != 'approved' AND NEW.status = 'approved') THEN
    
    -- Loop through each item in the sales order
    FOR item_record IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      -- Generate display_id: ISO-[CustomerPO]-[SO_ID]-[ItemNumber]
      new_display_id := 'ISO-' || NEW.po_number || '-' || NEW.so_id || '-' || LPAD(item_counter::text, 3, '0');
      
      -- Insert new work order with financial snapshot
      INSERT INTO public.work_orders (
        wo_id,
        display_id,
        customer,
        customer_po,
        item_code,
        revision,
        quantity,
        due_date,
        priority,
        sales_order,
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
        NEW.po_number,
        COALESCE(item_record->>'item_code', 'N/A'),
        COALESCE(item_record->>'revision', '0'),
        COALESCE((item_record->>'quantity')::integer, 0),
        COALESCE((item_record->>'due_date')::date, CURRENT_DATE + interval '30 days'),
        COALESCE((item_record->>'priority')::integer, 3),
        NEW.id,
        'pending',
        'goods_in',
        NEW.gross_weight_per_pc_grams,
        NEW.net_weight_per_pc_grams,
        NEW.material_rod_forging_size_mm,
        NEW.cycle_time_seconds,
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
            'alloy', NEW.alloy,
            'material_size_mm', NEW.material_rod_forging_size_mm
          )
        )
      );
      
      item_counter := item_counter + 1;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate trigger to ensure it points to updated function
DROP TRIGGER IF EXISTS tr_auto_generate_work_orders ON public.sales_orders;
CREATE TRIGGER tr_auto_generate_work_orders
AFTER INSERT OR UPDATE ON public.sales_orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_generate_work_orders();