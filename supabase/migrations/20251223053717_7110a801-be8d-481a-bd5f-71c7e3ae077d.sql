-- Fix sync_qc_to_wo function to use correct enum values (pass/fail not passed/failed)
CREATE OR REPLACE FUNCTION public.sync_qc_to_wo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- When QC-In result changes to pass/fail, update the linked Work Order
  IF NEW.qc_type = 'first_piece' AND NEW.result IN ('pass', 'fail') THEN
    UPDATE public.work_orders
    SET 
      qc_material_status = CASE WHEN NEW.result = 'pass' THEN 'passed' ELSE 'failed' END,
      qc_material_passed = (NEW.result = 'pass'),
      qc_material_approved_by = NEW.approved_by,
      qc_material_approved_at = NEW.approved_at,
      qc_material_remarks = NEW.remarks,
      production_allowed = (NEW.result = 'pass'),
      updated_at = now()
    WHERE id = NEW.wo_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Fix update_wo_qc_status function to use correct enum values (pass/fail not passed/failed)
CREATE OR REPLACE FUNCTION public.update_wo_qc_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- If QC failed, lock production
  IF NEW.result = 'fail' THEN
    UPDATE public.work_orders
    SET qc_status = 'failed',
        production_locked = true,
        updated_at = now()
    WHERE id = NEW.wo_id;
  -- If QC passed, approve and unlock
  ELSIF NEW.result = 'pass' THEN
    UPDATE public.work_orders
    SET qc_status = 'approved',
        production_locked = false,
        updated_at = now()
    WHERE id = NEW.wo_id;
  END IF;
  
  RETURN NEW;
END;
$function$;