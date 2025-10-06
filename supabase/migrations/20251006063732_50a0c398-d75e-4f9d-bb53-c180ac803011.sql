-- Ensure auto-generated Work Orders have safe defaults
CREATE OR REPLACE FUNCTION public.auto_generate_work_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  item_record jsonb;
  wo_counter integer := 0;
  new_wo_id text;
BEGIN
  -- Only generate WOs when status changes to 'approved'
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') OR 
     (TG_OP = 'UPDATE' AND OLD.status != 'approved' AND NEW.status = 'approved') THEN
    
    -- Loop through each item in the sales order
    FOR item_record IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      wo_counter := wo_counter + 1;
      
      -- Generate WO ID with proper padding
      new_wo_id := NEW.so_id || '-WO-' || LPAD(wo_counter::text, 3, '0');
      
      -- Insert new work order with safe defaults
      INSERT INTO public.work_orders (
        wo_id,
        customer,
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
        material_size_mm
      ) VALUES (
        new_wo_id,
        COALESCE(NEW.customer, 'Unknown'),
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
        NEW.material_rod_forging_size_mm
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;