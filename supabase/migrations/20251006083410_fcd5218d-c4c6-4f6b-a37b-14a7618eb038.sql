-- Update work_orders table: change wo_id to UUID type with auto-generation
-- First, we need to handle existing data
DO $$ 
BEGIN
  -- Check if wo_id is not already UUID type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'work_orders' 
    AND column_name = 'wo_id' 
    AND data_type = 'text'
  ) THEN
    -- Drop the unique constraint on wo_id temporarily
    ALTER TABLE public.work_orders DROP CONSTRAINT IF EXISTS work_orders_wo_id_key;
    
    -- Add a new UUID column
    ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS wo_id_uuid uuid DEFAULT gen_random_uuid();
    
    -- Copy old wo_id to display_id if display_id is null
    UPDATE public.work_orders 
    SET display_id = wo_id 
    WHERE display_id IS NULL;
    
    -- Drop old wo_id column
    ALTER TABLE public.work_orders DROP COLUMN wo_id;
    
    -- Rename wo_id_uuid to wo_id
    ALTER TABLE public.work_orders RENAME COLUMN wo_id_uuid TO wo_id;
    
    -- Add unique constraint back to wo_id
    ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_wo_id_key UNIQUE (wo_id);
  END IF;
END $$;

-- Ensure display_id column exists
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS display_id text;

-- Update auto_generate_work_orders function to use UUID for wo_id
CREATE OR REPLACE FUNCTION public.auto_generate_work_orders()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item_record jsonb;
  new_display_id text;
BEGIN
  -- Only generate WOs when status changes to 'approved'
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') OR 
     (TG_OP = 'UPDATE' AND OLD.status != 'approved' AND NEW.status = 'approved') THEN
    
    -- Set display_id for user-facing display
    new_display_id := 'ISO-' || NEW.po_number;
    
    -- Loop through each item in the sales order
    FOR item_record IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      -- Insert new work order with auto-generated UUID wo_id and user-friendly display_id
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
        material_size_mm
      ) VALUES (
        gen_random_uuid(),
        new_display_id,
        COALESCE(NEW.customer, 'Unknown'),
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
        NEW.material_rod_forging_size_mm
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;