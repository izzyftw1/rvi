-- Update auto_generate_work_orders to carry cycle_time_seconds from sales_orders
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
  -- Only generate WOs when status changes to 'approved'
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') OR 
     (TG_OP = 'UPDATE' AND OLD.status != 'approved' AND NEW.status = 'approved') THEN
    
    -- Loop through each item in the sales order
    FOR item_record IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      -- Generate display_id: ISO-[CustomerPO]-[SO_ID]-[ItemNumber]
      new_display_id := 'ISO-' || NEW.po_number || '-' || NEW.so_id || '-' || LPAD(item_counter::text, 3, '0');
      
      -- Insert new work order with cycle_time_seconds from sales order
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
        cycle_time_seconds
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
        NEW.cycle_time_seconds
      );
      
      item_counter := item_counter + 1;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Add override_cycle_time column to wo_machine_assignments
ALTER TABLE wo_machine_assignments 
ADD COLUMN IF NOT EXISTS override_cycle_time_seconds numeric;

-- Add override tracking columns
ALTER TABLE wo_machine_assignments 
ADD COLUMN IF NOT EXISTS override_applied_by uuid REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS override_applied_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS original_cycle_time_seconds numeric;