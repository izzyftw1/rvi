-- CRITICAL GAP 1: Populate batch_quantity from work_orders.quantity on batch creation
-- CRITICAL GAP 2: Sync produced_qty from daily_production_logs aggregation
-- CRITICAL GAP 3: Sync work_order fields from batch totals
-- CRITICAL GAP 4: Auto-propagation triggers for production_batches

-- =============================================================================
-- GAP 1: Trigger to populate batch_quantity from work_orders.quantity on insert
-- =============================================================================
CREATE OR REPLACE FUNCTION public.populate_batch_quantity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wo_quantity INTEGER;
BEGIN
  -- If batch_quantity is not set (0 or NULL), populate from work order
  IF NEW.batch_quantity IS NULL OR NEW.batch_quantity = 0 THEN
    SELECT quantity INTO v_wo_quantity
    FROM work_orders
    WHERE id = NEW.wo_id;
    
    NEW.batch_quantity := COALESCE(v_wo_quantity, 0);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_populate_batch_quantity ON production_batches;
CREATE TRIGGER tr_populate_batch_quantity
  BEFORE INSERT ON production_batches
  FOR EACH ROW
  EXECUTE FUNCTION populate_batch_quantity();

-- =============================================================================
-- GAP 2: Trigger to sync produced_qty from daily_production_logs
-- =============================================================================
CREATE OR REPLACE FUNCTION public.sync_batch_produced_qty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_ok INTEGER;
  v_total_rejected INTEGER;
BEGIN
  -- Skip if no batch_id
  IF COALESCE(NEW.batch_id, OLD.batch_id) IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Calculate total ok_quantity for this batch
  SELECT 
    COALESCE(SUM(ok_quantity), 0),
    COALESCE(SUM(total_rejection_quantity), 0)
  INTO v_total_ok, v_total_rejected
  FROM daily_production_logs
  WHERE batch_id = COALESCE(NEW.batch_id, OLD.batch_id);
  
  -- Update the production batch
  UPDATE production_batches
  SET 
    produced_qty = v_total_ok,
    qc_rejected_qty = v_total_rejected
  WHERE id = COALESCE(NEW.batch_id, OLD.batch_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_batch_produced_qty_insert ON daily_production_logs;
CREATE TRIGGER tr_sync_batch_produced_qty_insert
  AFTER INSERT ON daily_production_logs
  FOR EACH ROW
  EXECUTE FUNCTION sync_batch_produced_qty();

DROP TRIGGER IF EXISTS tr_sync_batch_produced_qty_update ON daily_production_logs;
CREATE TRIGGER tr_sync_batch_produced_qty_update
  AFTER UPDATE ON daily_production_logs
  FOR EACH ROW
  EXECUTE FUNCTION sync_batch_produced_qty();

DROP TRIGGER IF EXISTS tr_sync_batch_produced_qty_delete ON daily_production_logs;
CREATE TRIGGER tr_sync_batch_produced_qty_delete
  AFTER DELETE ON daily_production_logs
  FOR EACH ROW
  EXECUTE FUNCTION sync_batch_produced_qty();

-- =============================================================================
-- GAP 3: Trigger to sync work_order fields from batch totals
-- =============================================================================
CREATE OR REPLACE FUNCTION public.sync_wo_from_batches()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wo_id UUID;
  v_total_completed INTEGER;
  v_total_rejected INTEGER;
  v_total_dispatched INTEGER;
  v_wo_quantity INTEGER;
  v_completion_pct NUMERIC;
BEGIN
  -- Get the work order ID
  v_wo_id := COALESCE(NEW.wo_id, OLD.wo_id);
  
  IF v_wo_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Calculate totals from all batches for this work order
  SELECT 
    COALESCE(SUM(produced_qty), 0),
    COALESCE(SUM(qc_rejected_qty), 0),
    COALESCE(SUM(dispatched_qty), 0)
  INTO v_total_completed, v_total_rejected, v_total_dispatched
  FROM production_batches
  WHERE wo_id = v_wo_id;
  
  -- Get work order quantity for completion percentage
  SELECT quantity INTO v_wo_quantity
  FROM work_orders
  WHERE id = v_wo_id;
  
  -- Calculate completion percentage
  IF v_wo_quantity > 0 THEN
    v_completion_pct := ROUND((v_total_completed::NUMERIC / v_wo_quantity::NUMERIC) * 100, 2);
  ELSE
    v_completion_pct := 0;
  END IF;
  
  -- Update work order with aggregated values
  UPDATE work_orders
  SET 
    qty_completed = v_total_completed,
    qty_rejected = v_total_rejected,
    qty_dispatched = v_total_dispatched,
    completion_pct = v_completion_pct,
    updated_at = NOW()
  WHERE id = v_wo_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_wo_from_batches_insert ON production_batches;
CREATE TRIGGER tr_sync_wo_from_batches_insert
  AFTER INSERT ON production_batches
  FOR EACH ROW
  EXECUTE FUNCTION sync_wo_from_batches();

DROP TRIGGER IF EXISTS tr_sync_wo_from_batches_update ON production_batches;
CREATE TRIGGER tr_sync_wo_from_batches_update
  AFTER UPDATE OF produced_qty, qc_rejected_qty, dispatched_qty ON production_batches
  FOR EACH ROW
  EXECUTE FUNCTION sync_wo_from_batches();

DROP TRIGGER IF EXISTS tr_sync_wo_from_batches_delete ON production_batches;
CREATE TRIGGER tr_sync_wo_from_batches_delete
  AFTER DELETE ON production_batches
  FOR EACH ROW
  EXECUTE FUNCTION sync_wo_from_batches();

-- =============================================================================
-- GAP 4: Auto-propagation triggers already created above
-- Additional: Update batch current_process when stage changes
-- =============================================================================
CREATE OR REPLACE FUNCTION public.auto_update_batch_process()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If stage_type changes, update current_process to match
  IF NEW.stage_type IS DISTINCT FROM OLD.stage_type THEN
    IF NEW.current_process IS NULL OR NEW.current_process = OLD.stage_type THEN
      NEW.current_process := NEW.stage_type;
    END IF;
    NEW.stage_entered_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_auto_update_batch_process ON production_batches;
CREATE TRIGGER tr_auto_update_batch_process
  BEFORE UPDATE OF stage_type ON production_batches
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_batch_process();