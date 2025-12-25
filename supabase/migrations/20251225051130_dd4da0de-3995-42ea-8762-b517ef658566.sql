-- Fix: Skip WO update when logs are only being locked (no quantity change)
-- This prevents the "tuple already modified" error during Final QC waiver/release

CREATE OR REPLACE FUNCTION public.sync_wo_progress_from_logs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wo_id UUID;
  v_total_ok INTEGER;
  v_total_rejected INTEGER;
BEGIN
  -- Determine which work order to update
  IF TG_OP = 'DELETE' THEN
    v_wo_id := OLD.wo_id;
  ELSE
    v_wo_id := NEW.wo_id;
  END IF;

  -- Skip if no work order linked
  IF v_wo_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- CRITICAL FIX: Skip update if only locked/locked_at/locked_by/locked_reason changed
  -- This prevents "tuple already modified" error during quality release
  IF TG_OP = 'UPDATE' THEN
    IF OLD.ok_quantity IS NOT DISTINCT FROM NEW.ok_quantity 
       AND OLD.total_rejection_quantity IS NOT DISTINCT FROM NEW.total_rejection_quantity
       AND OLD.actual_quantity IS NOT DISTINCT FROM NEW.actual_quantity THEN
      -- No quantity change - skip the WO update (likely just a lock operation)
      RETURN NEW;
    END IF;
  END IF;

  -- Calculate aggregates from all production logs for this WO
  SELECT 
    COALESCE(SUM(ok_quantity), 0)::INTEGER,
    COALESCE(SUM(total_rejection_quantity), 0)::INTEGER
  INTO v_total_ok, v_total_rejected
  FROM public.daily_production_logs
  WHERE wo_id = v_wo_id;

  -- Update the work order with cached values
  UPDATE public.work_orders
  SET 
    qty_completed = v_total_ok,
    qty_rejected = v_total_rejected,
    updated_at = now()
  WHERE id = v_wo_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;