-- Fix sync_wo_qc_status: qc_records.result is qc_result enum (pass/fail/pending/rework)
-- Old code compared to invalid enum labels ('passed', 'waived') causing insert/update failures.
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
  v_status_text := CASE
    WHEN NEW.result = 'pass' THEN 'passed'
    WHEN NEW.result = 'fail' THEN 'failed'
    WHEN NEW.result = 'rework' THEN 'hold'
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
      production_locked = (NEW.result IS DISTINCT FROM 'pass'),
      updated_at = now()
    WHERE id = NEW.wo_id;

  ELSIF NEW.qc_type = 'first_piece' THEN
    UPDATE public.work_orders
    SET 
      qc_first_piece_status = v_status_text,
      qc_first_piece_approved_at = NEW.approved_at,
      qc_first_piece_approved_by = NEW.approved_by,
      qc_first_piece_remarks = NEW.remarks,
      production_locked = (NEW.result IS DISTINCT FROM 'pass'),
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