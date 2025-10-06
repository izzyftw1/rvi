-- Update auto_generate_work_orders to use ISO-[CustomerPO]-[SO_ID] format
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
      
      -- Insert new work order
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
        NEW.material_rod_forging_size_mm
      );
      
      item_counter := item_counter + 1;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Add notification trigger for QC when material is received
CREATE OR REPLACE FUNCTION public.notify_qc_on_material_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Notify all QC users when new material is received
  INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id)
  SELECT 
    ur.user_id,
    'qc_required',
    'New Material Received - QC Required',
    'Material lot ' || NEW.lot_id || ' (Heat: ' || NEW.heat_no || ') has been received and requires OES testing.',
    'material_lot',
    NEW.id
  FROM public.user_roles ur
  WHERE ur.role = 'quality'
  AND NEW.qc_status = 'pending';
  
  RETURN NEW;
END;
$function$;

-- Create trigger for QC notification
DROP TRIGGER IF EXISTS trigger_notify_qc_on_material_receipt ON public.material_lots;
CREATE TRIGGER trigger_notify_qc_on_material_receipt
  AFTER INSERT ON public.material_lots
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_qc_on_material_receipt();

-- Add function to update SO status when all WOs are complete
CREATE OR REPLACE FUNCTION public.sync_wo_status_to_so()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- Ensure trigger exists for WO to SO sync
DROP TRIGGER IF EXISTS trigger_sync_wo_status_to_so ON public.work_orders;
CREATE TRIGGER trigger_sync_wo_status_to_so
  AFTER UPDATE OF status ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_wo_status_to_so();