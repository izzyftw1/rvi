-- Add display_id column to work_orders table for user-facing display
ALTER TABLE public.work_orders 
ADD COLUMN IF NOT EXISTS display_id text;

-- Create index for faster display_id searches
CREATE INDEX IF NOT EXISTS idx_work_orders_display_id ON public.work_orders(display_id);

-- Update existing records to have display_id = ISO-[customer_po]
UPDATE public.work_orders 
SET display_id = 'ISO-' || COALESCE(customer_po, 'UNKNOWN')
WHERE display_id IS NULL;

-- Update auto_generate_work_orders function to set both wo_id and display_id
CREATE OR REPLACE FUNCTION public.auto_generate_work_orders()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item_record jsonb;
  wo_counter integer := 0;
  new_wo_id text;
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
      wo_counter := wo_counter + 1;
      
      -- Generate unique WO_ID in format ISO-[CustomerPO]-[SO_ID]-[counter]
      new_wo_id := 'ISO-' || NEW.po_number || '-' || NEW.so_id;
      
      -- If multiple items, append counter to ensure uniqueness
      IF jsonb_array_length(NEW.items) > 1 THEN
        new_wo_id := new_wo_id || '-' || LPAD(wo_counter::text, 2, '0');
      END IF;
      
      -- Insert new work order with unique wo_id and user-friendly display_id
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
        new_wo_id,
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