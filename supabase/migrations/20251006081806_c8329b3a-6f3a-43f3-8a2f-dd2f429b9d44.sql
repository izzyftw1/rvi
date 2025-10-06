-- Add customer_po column to work_orders table for better searchability
ALTER TABLE public.work_orders 
ADD COLUMN IF NOT EXISTS customer_po text;

-- Create index for faster customer_po searches
CREATE INDEX IF NOT EXISTS idx_work_orders_customer_po ON public.work_orders(customer_po);

-- Update auto_generate_work_orders function to use unique WO_ID format
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
BEGIN
  -- Only generate WOs when status changes to 'approved'
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') OR 
     (TG_OP = 'UPDATE' AND OLD.status != 'approved' AND NEW.status = 'approved') THEN
    
    -- Loop through each item in the sales order
    FOR item_record IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      wo_counter := wo_counter + 1;
      
      -- Generate WO_ID in format ISO-[CustomerPO]-[SO_ID] for uniqueness
      new_wo_id := 'ISO-' || NEW.po_number || '-' || NEW.so_id;
      
      -- If multiple items, append counter
      IF jsonb_array_length(NEW.items) > 1 THEN
        new_wo_id := new_wo_id || '-' || LPAD(wo_counter::text, 2, '0');
      END IF;
      
      -- Insert new work order with unique WO_ID and separate customer_po field
      INSERT INTO public.work_orders (
        wo_id,
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
        COALESCE(NEW.customer, 'Unknown'),
        NEW.po_number,  -- Store customer PO separately
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