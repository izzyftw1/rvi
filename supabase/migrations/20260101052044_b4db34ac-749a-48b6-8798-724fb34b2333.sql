-- Fix the trigger that has a type mismatch
CREATE OR REPLACE FUNCTION public.auto_update_batch_process()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- If stage_type changes, update current_process to match
  IF NEW.stage_type IS DISTINCT FROM OLD.stage_type THEN
    -- Cast stage_type to text for comparison
    IF NEW.current_process IS NULL OR NEW.current_process = OLD.stage_type::text THEN
      NEW.current_process := NEW.stage_type::text;
    END IF;
    NEW.stage_entered_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Now update production_batches to set stage_type='external' for WOs that have active external moves
UPDATE production_batches pb
SET 
  stage_type = 'external'::batch_stage_type,
  current_process = 'external',
  external_partner_id = COALESCE(pb.external_partner_id, (
    SELECT m.partner_id 
    FROM wo_external_moves m 
    WHERE m.work_order_id = pb.wo_id 
      AND m.status IN ('sent', 'in_transit', 'partial')
    ORDER BY m.created_at DESC
    LIMIT 1
  )),
  external_process_type = COALESCE(pb.external_process_type, (
    SELECT m.process 
    FROM wo_external_moves m 
    WHERE m.work_order_id = pb.wo_id 
      AND m.status IN ('sent', 'in_transit', 'partial')
    ORDER BY m.created_at DESC
    LIMIT 1
  )),
  external_sent_at = COALESCE(pb.external_sent_at, (
    SELECT m.dispatch_date 
    FROM wo_external_moves m 
    WHERE m.work_order_id = pb.wo_id 
      AND m.status IN ('sent', 'in_transit', 'partial')
    ORDER BY m.created_at DESC
    LIMIT 1
  )),
  stage_entered_at = COALESCE(pb.stage_entered_at, pb.started_at),
  current_location_type = 'external_partner'
WHERE pb.ended_at IS NULL
  AND pb.stage_type = 'production'
  AND EXISTS (
    SELECT 1 FROM wo_external_moves m 
    WHERE m.work_order_id = pb.wo_id 
      AND m.status IN ('sent', 'in_transit', 'partial')
  );