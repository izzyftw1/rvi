-- Update the auto_generate_work_orders function to use ISO-[CustomerPO] format
CREATE OR REPLACE FUNCTION public.auto_generate_work_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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
      
      -- Generate WO ID in format ISO-[CustomerPO]
      new_wo_id := 'ISO-' || NEW.po_number;
      
      -- If multiple items, append counter
      IF jsonb_array_length(NEW.items) > 1 THEN
        new_wo_id := new_wo_id || '-' || LPAD(wo_counter::text, 2, '0');
      END IF;
      
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
        'active',
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

-- Add trigger to auto-update SO status when WO is completed
CREATE OR REPLACE FUNCTION public.sync_wo_status_to_so()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  all_wos_complete boolean;
BEGIN
  -- When WO status changes to 'completed', check if all WOs for this SO are complete
  IF NEW.status = 'completed' AND NEW.sales_order IS NOT NULL THEN
    -- Check if all work orders for this sales order are completed
    SELECT NOT EXISTS (
      SELECT 1 FROM public.work_orders
      WHERE sales_order = NEW.sales_order
      AND status != 'completed'
    ) INTO all_wos_complete;
    
    -- If all WOs are complete, mark SO as fulfilled
    IF all_wos_complete THEN
      UPDATE public.sales_orders
      SET status = 'fulfilled'
      WHERE id = NEW.sales_order;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Add trigger to cancel WOs when SO is cancelled
CREATE OR REPLACE FUNCTION public.cancel_wos_on_so_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  -- When SO status changes to 'cancelled', cancel all linked WOs
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    UPDATE public.work_orders
    SET status = 'cancelled'
    WHERE sales_order = NEW.id
    AND status NOT IN ('completed', 'cancelled');
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create triggers
DROP TRIGGER IF EXISTS sync_wo_completion_to_so ON public.work_orders;
CREATE TRIGGER sync_wo_completion_to_so
  AFTER UPDATE ON public.work_orders
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
  EXECUTE FUNCTION public.sync_wo_status_to_so();

DROP TRIGGER IF EXISTS cancel_wos_on_so_cancel ON public.sales_orders;
CREATE TRIGGER cancel_wos_on_so_cancel
  AFTER UPDATE ON public.sales_orders
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status != 'cancelled')
  EXECUTE FUNCTION public.cancel_wos_on_so_cancel();

-- Update sales_orders to add 'fulfilled' and 'cancelled' status options
-- (These status values will be used by the triggers above)