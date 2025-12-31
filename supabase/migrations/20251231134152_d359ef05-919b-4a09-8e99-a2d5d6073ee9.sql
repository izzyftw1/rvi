-- Prevent cascade updates when production logs are locked/unlocked.
-- Locking a log should not recompute batch totals, otherwise it triggers batch->WO sync and can cause
-- "tuple to be updated was already modified" when the WO update is in the same statement.

CREATE OR REPLACE FUNCTION public.sync_batch_produced_qty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_ok INTEGER;
  v_total_rejected INTEGER;
  v_batch_id UUID;
BEGIN
  v_batch_id := COALESCE(NEW.batch_id, OLD.batch_id);

  -- Skip if no batch_id
  IF v_batch_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- CRITICAL FIX: If this UPDATE did not change quantities, skip recompute.
  -- This prevents lock/unlock updates (locked, locked_at, locked_by, locked_reason)
  -- from triggering production_batches updates, which then trigger WO sync.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.ok_quantity IS NOT DISTINCT FROM NEW.ok_quantity
       AND OLD.total_rejection_quantity IS NOT DISTINCT FROM NEW.total_rejection_quantity
       AND OLD.actual_quantity IS NOT DISTINCT FROM NEW.actual_quantity
       AND OLD.batch_id IS NOT DISTINCT FROM NEW.batch_id THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Calculate totals for this batch
  SELECT 
    COALESCE(SUM(ok_quantity), 0),
    COALESCE(SUM(total_rejection_quantity), 0)
  INTO v_total_ok, v_total_rejected
  FROM daily_production_logs
  WHERE batch_id = v_batch_id;

  -- Update the production batch
  UPDATE production_batches
  SET 
    produced_qty = v_total_ok,
    qc_rejected_qty = v_total_rejected
  WHERE id = v_batch_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;