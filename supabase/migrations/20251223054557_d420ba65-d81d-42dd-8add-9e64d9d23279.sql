-- Drop and recreate all QC-related trigger functions to ensure clean state

-- 1. Fix sync_wo_qc_status - this updates work_orders when qc_records changes
DROP FUNCTION IF EXISTS public.sync_wo_qc_status() CASCADE;
CREATE OR REPLACE FUNCTION public.sync_wo_qc_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status_text text;
BEGIN
  -- Map qc_result enum to the text statuses used on work_orders
  -- NEW.result is of type qc_result enum with values: pass, fail, rework, pending
  v_status_text := CASE NEW.result::text
    WHEN 'pass' THEN 'passed'
    WHEN 'fail' THEN 'failed'
    WHEN 'rework' THEN 'hold'
    ELSE 'pending'
  END;

  -- Update work order based on qc_type
  IF NEW.qc_type = 'incoming' THEN
    UPDATE public.work_orders
    SET 
      qc_raw_material_status = v_status_text,
      qc_raw_material_approved_at = NEW.approved_at,
      qc_raw_material_approved_by = NEW.approved_by,
      qc_raw_material_remarks = NEW.remarks,
      production_locked = (NEW.result::text <> 'pass'),
      updated_at = now()
    WHERE id = NEW.wo_id;

  ELSIF NEW.qc_type = 'first_piece' THEN
    UPDATE public.work_orders
    SET 
      qc_first_piece_status = v_status_text,
      qc_first_piece_approved_at = NEW.approved_at,
      qc_first_piece_approved_by = NEW.approved_by,
      qc_first_piece_remarks = NEW.remarks,
      production_locked = (NEW.result::text <> 'pass'),
      updated_at = now()
    WHERE id = NEW.wo_id;

  ELSIF NEW.qc_type = 'final' THEN
    UPDATE public.work_orders
    SET 
      qc_final_status = v_status_text,
      qc_final_approved_at = NEW.approved_at,
      qc_final_approved_by = NEW.approved_by,
      qc_final_remarks = NEW.remarks,
      updated_at = now()
    WHERE id = NEW.wo_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Recreate the trigger
CREATE TRIGGER trigger_sync_wo_qc_status 
AFTER INSERT OR UPDATE ON public.qc_records 
FOR EACH ROW 
EXECUTE FUNCTION sync_wo_qc_status();

-- 2. Fix sync_qc_to_wo - this also updates work_orders when qc_records result changes
DROP FUNCTION IF EXISTS public.sync_qc_to_wo() CASCADE;
CREATE OR REPLACE FUNCTION public.sync_qc_to_wo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- When QC-In result changes to pass/fail, update the linked Work Order
  IF NEW.qc_type = 'first_piece' AND NEW.result::text IN ('pass', 'fail') THEN
    UPDATE public.work_orders
    SET 
      qc_material_status = CASE WHEN NEW.result::text = 'pass' THEN 'passed' ELSE 'failed' END,
      qc_material_passed = (NEW.result::text = 'pass'),
      qc_material_approved_by = NEW.approved_by,
      qc_material_approved_at = NEW.approved_at,
      qc_material_remarks = NEW.remarks,
      production_allowed = (NEW.result::text = 'pass'),
      updated_at = now()
    WHERE id = NEW.wo_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Recreate the trigger
CREATE TRIGGER tr_sync_qc_to_wo 
AFTER UPDATE ON public.qc_records 
FOR EACH ROW 
WHEN (old.result IS DISTINCT FROM new.result) 
EXECUTE FUNCTION sync_qc_to_wo();

-- 3. Fix update_wo_qc_status
DROP FUNCTION IF EXISTS public.update_wo_qc_status() CASCADE;
CREATE OR REPLACE FUNCTION public.update_wo_qc_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- If QC failed, lock production
  IF NEW.result::text = 'fail' THEN
    UPDATE public.work_orders
    SET qc_status = 'failed',
        production_locked = true,
        updated_at = now()
    WHERE id = NEW.wo_id;
  -- If QC passed, approve and unlock
  ELSIF NEW.result::text = 'pass' THEN
    UPDATE public.work_orders
    SET qc_status = 'approved',
        production_locked = false,
        updated_at = now()
    WHERE id = NEW.wo_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Recreate the trigger
CREATE TRIGGER trigger_update_wo_qc 
AFTER UPDATE ON public.qc_records 
FOR EACH ROW 
WHEN (new.result IS DISTINCT FROM old.result) 
EXECUTE FUNCTION update_wo_qc_status();