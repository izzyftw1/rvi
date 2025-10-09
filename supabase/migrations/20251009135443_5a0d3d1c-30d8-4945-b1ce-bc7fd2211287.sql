-- Fix QC-In workflow to use correct enum value
DROP TRIGGER IF EXISTS tr_auto_create_qc_incoming ON public.work_orders;
DROP TRIGGER IF EXISTS tr_sync_qc_to_wo ON public.qc_records;
DROP FUNCTION IF EXISTS public.auto_create_qc_incoming();
DROP FUNCTION IF EXISTS public.sync_qc_to_wo();

-- Auto-generate QC-In record when WO is created (Material QC Gate)
CREATE OR REPLACE FUNCTION public.auto_create_qc_incoming()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_qc_id text;
  qc_count integer;
BEGIN
  -- Only create QC record for new Work Orders
  IF TG_OP = 'INSERT' THEN
    -- Generate QC-IN ID
    SELECT COUNT(*) INTO qc_count FROM qc_records WHERE qc_type = 'first_piece';
    new_qc_id := 'QC-IN-' || LPAD((qc_count + 1)::text, 6, '0');
    
    -- Insert QC record linked to this Work Order
    INSERT INTO public.qc_records (
      qc_id,
      wo_id,
      qc_type,
      result,
      approved_by,
      measurements,
      remarks
    ) VALUES (
      new_qc_id,
      NEW.id,
      'first_piece',
      'pending',
      NULL,
      jsonb_build_object(
        'material_size_mm', NEW.material_size_mm,
        'item_code', NEW.item_code,
        'customer', NEW.customer
      ),
      'Auto-generated QC-In record for Work Order ' || COALESCE(NEW.display_id, NEW.wo_id)
    );
    
    RAISE NOTICE 'Created QC-In record % for WO %', new_qc_id, NEW.display_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Attach trigger to work_orders
CREATE TRIGGER tr_auto_create_qc_incoming
AFTER INSERT ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_qc_incoming();

-- Update Work Order QC status when QC record is updated
CREATE OR REPLACE FUNCTION public.sync_qc_to_wo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When QC-In result changes to passed/failed, update the linked Work Order
  IF NEW.qc_type = 'first_piece' AND NEW.result IN ('passed', 'failed') THEN
    UPDATE public.work_orders
    SET 
      qc_material_status = NEW.result,
      qc_material_passed = (NEW.result = 'passed'),
      qc_material_approved_by = NEW.approved_by,
      qc_material_approved_at = NEW.approved_at,
      qc_material_remarks = NEW.remarks,
      production_allowed = (NEW.result = 'passed'),
      updated_at = now()
    WHERE id = NEW.wo_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Attach trigger to qc_records
CREATE TRIGGER tr_sync_qc_to_wo
AFTER UPDATE ON public.qc_records
FOR EACH ROW
WHEN (OLD.result IS DISTINCT FROM NEW.result)
EXECUTE FUNCTION public.sync_qc_to_wo();