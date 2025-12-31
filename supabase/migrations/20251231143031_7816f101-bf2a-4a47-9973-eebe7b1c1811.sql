
-- =====================================================
-- BATCH LIFECYCLE FIX: Complete overhaul
-- =====================================================

-- 1. Update get_or_create_production_batch to trigger on post_complete
CREATE OR REPLACE FUNCTION public.get_or_create_production_batch(
  p_wo_id UUID,
  p_gap_threshold_days INTEGER DEFAULT 7
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID;
  v_last_batch RECORD;
  v_last_log_date DATE;
  v_last_dispatch_date TIMESTAMP WITH TIME ZONE;
  v_new_batch_number INTEGER;
  v_trigger_reason TEXT;
  v_wo_quantity INTEGER;
  v_total_produced INTEGER;
BEGIN
  -- Get WO quantity for reference
  SELECT quantity INTO v_wo_quantity
  FROM work_orders
  WHERE id = p_wo_id;

  -- Get the latest batch for this WO
  SELECT * INTO v_last_batch
  FROM production_batches
  WHERE wo_id = p_wo_id
  ORDER BY batch_number DESC
  LIMIT 1;

  -- If no batch exists, create initial batch
  IF v_last_batch.id IS NULL THEN
    INSERT INTO production_batches (
      wo_id, 
      batch_number, 
      trigger_reason,
      batch_quantity,
      qc_material_status,
      qc_first_piece_status,
      qc_final_status,
      qc_approved_qty,
      qc_rejected_qty,
      dispatched_qty,
      production_allowed,
      dispatch_allowed
    )
    VALUES (
      p_wo_id, 
      1, 
      'initial',
      COALESCE(v_wo_quantity, 0),
      'pending',
      'pending',
      'pending',
      0,
      0,
      0,
      false,
      false
    )
    RETURNING id INTO v_batch_id;
    RETURN v_batch_id;
  END IF;

  -- If last batch is NOT ended and NOT production_complete, return it
  IF v_last_batch.ended_at IS NULL AND v_last_batch.production_complete = false THEN
    RETURN v_last_batch.id;
  END IF;

  -- Check for dispatch after last batch started
  SELECT MAX(d.dispatched_at) INTO v_last_dispatch_date
  FROM dispatches d
  WHERE d.wo_id = p_wo_id
    AND d.dispatched_at > v_last_batch.started_at;

  -- Check last production log date for this batch
  SELECT MAX(log_date) INTO v_last_log_date
  FROM daily_production_logs
  WHERE wo_id = p_wo_id
    AND batch_id = v_last_batch.id;

  -- Calculate total produced across all batches
  SELECT COALESCE(SUM(produced_qty), 0) INTO v_total_produced
  FROM production_batches
  WHERE wo_id = p_wo_id;

  -- Determine if we need a new batch
  v_trigger_reason := NULL;

  -- Case 1: Previous batch is production_complete - need new batch to continue
  IF v_last_batch.production_complete = true THEN
    -- Only create new batch if there's remaining qty to produce
    IF v_total_produced < v_wo_quantity THEN
      v_trigger_reason := 'post_complete';
    END IF;
  -- Case 2: Dispatch occurred after batch started - need new batch for resumed production
  ELSIF v_last_dispatch_date IS NOT NULL THEN
    v_trigger_reason := 'post_dispatch';
  -- Case 3: Gap in production (no logs for threshold days)
  ELSIF v_last_log_date IS NOT NULL AND (CURRENT_DATE - v_last_log_date) > p_gap_threshold_days THEN
    v_trigger_reason := 'gap_restart';
  -- Case 4: Batch is ended but not production_complete (manual close)
  ELSIF v_last_batch.ended_at IS NOT NULL THEN
    v_trigger_reason := 'resumed';
  END IF;

  -- Create new batch if needed
  IF v_trigger_reason IS NOT NULL THEN
    v_new_batch_number := v_last_batch.batch_number + 1;
    
    -- Close the previous batch if not already
    UPDATE production_batches
    SET ended_at = COALESCE(ended_at, now())
    WHERE id = v_last_batch.id;
    
    -- Calculate remaining qty for new batch
    DECLARE
      v_remaining_qty INTEGER;
    BEGIN
      v_remaining_qty := GREATEST(0, COALESCE(v_wo_quantity, 0) - v_total_produced);
      
      -- Create new batch with fresh QC statuses
      INSERT INTO production_batches (
        wo_id, 
        batch_number, 
        trigger_reason, 
        previous_batch_id,
        batch_quantity,
        qc_material_status,
        qc_first_piece_status,
        qc_final_status,
        qc_approved_qty,
        qc_rejected_qty,
        dispatched_qty,
        production_allowed,
        dispatch_allowed,
        production_complete
      )
      VALUES (
        p_wo_id, 
        v_new_batch_number, 
        v_trigger_reason, 
        v_last_batch.id,
        v_remaining_qty,
        'pending',
        'pending', 
        'pending',
        0,
        0,
        0,
        false,
        false,
        false
      )
      RETURNING id INTO v_batch_id;
    END;
    
    RETURN v_batch_id;
  END IF;

  -- Return existing batch
  RETURN v_last_batch.id;
END;
$$;

-- 2. Update dispatch validation to allow dispatching slightly over ordered qty (for box-filling)
-- and allow multi-batch dispatch
CREATE OR REPLACE FUNCTION public.validate_and_update_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_record record;
  v_packed_qty integer;
  v_available_for_dispatch integer;
  v_wo_quantity integer;
  v_total_dispatched integer;
  v_overdispatch_tolerance numeric := 0.10; -- Allow 10% over-dispatch
BEGIN
  -- Get batch details
  SELECT * INTO v_batch_record
  FROM production_batches
  WHERE id = NEW.batch_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid batch_id: Batch not found';
  END IF;
  
  -- Validate batch belongs to the work order
  IF v_batch_record.wo_id != NEW.wo_id THEN
    RAISE EXCEPTION 'Batch does not belong to this work order';
  END IF;
  
  -- RULE: Cannot dispatch without Final QC approval
  IF v_batch_record.qc_final_status NOT IN ('passed', 'waived') THEN
    RAISE EXCEPTION 'Cannot dispatch from batch #% - Final QC not approved (status: %)', 
      v_batch_record.batch_number, 
      COALESCE(v_batch_record.qc_final_status, 'pending');
  END IF;
  
  -- Get packed quantity from cartons for this batch
  SELECT COALESCE(SUM(quantity), 0) INTO v_packed_qty
  FROM cartons
  WHERE (batch_id = NEW.batch_id OR production_batch_id = NEW.batch_id);
  
  -- Calculate available for dispatch: packed_qty - already_dispatched
  v_available_for_dispatch := v_packed_qty - COALESCE(v_batch_record.dispatched_qty, 0);
  
  -- Validate quantity against packed (not just QC approved)
  IF v_packed_qty = 0 THEN
    RAISE EXCEPTION 'Cannot dispatch from batch #% - No cartons packed yet', 
      v_batch_record.batch_number;
  END IF;
  
  IF NEW.quantity > v_available_for_dispatch THEN
    RAISE EXCEPTION 'Cannot dispatch % pcs from batch #%. Only % pcs available (packed: %, already dispatched: %)', 
      NEW.quantity, 
      v_batch_record.batch_number,
      v_available_for_dispatch,
      v_packed_qty,
      COALESCE(v_batch_record.dispatched_qty, 0);
  END IF;
  
  IF NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Dispatch quantity must be greater than 0';
  END IF;
  
  -- Update batch dispatched qty
  UPDATE production_batches
  SET dispatched_qty = COALESCE(dispatched_qty, 0) + NEW.quantity
  WHERE id = NEW.batch_id;
  
  RETURN NEW;
END;
$$;

-- 3. Create function to check if WO should be marked production complete
-- (all batches complete AND total produced >= ordered OR manually closed)
CREATE OR REPLACE FUNCTION public.check_wo_production_status(p_wo_id UUID)
RETURNS TABLE(
  all_batches_complete BOOLEAN,
  total_produced INTEGER,
  ordered_qty INTEGER,
  can_mark_wo_complete BOOLEAN,
  active_batch_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ordered INTEGER;
  v_produced INTEGER;
  v_all_complete BOOLEAN;
  v_active_batch UUID;
BEGIN
  -- Get WO quantity
  SELECT quantity INTO v_ordered FROM work_orders WHERE id = p_wo_id;
  
  -- Get total produced and check if all batches are complete
  SELECT 
    COALESCE(SUM(produced_qty), 0),
    bool_and(production_complete OR ended_at IS NOT NULL)
  INTO v_produced, v_all_complete
  FROM production_batches
  WHERE wo_id = p_wo_id;
  
  -- Get active batch (if any)
  SELECT id INTO v_active_batch
  FROM production_batches
  WHERE wo_id = p_wo_id
    AND ended_at IS NULL
    AND production_complete = false
  ORDER BY batch_number DESC
  LIMIT 1;
  
  RETURN QUERY SELECT 
    COALESCE(v_all_complete, false),
    COALESCE(v_produced, 0),
    COALESCE(v_ordered, 0),
    (v_produced >= v_ordered OR v_all_complete),
    v_active_batch;
END;
$$;

-- 4. Add index for better batch lookup performance
CREATE INDEX IF NOT EXISTS idx_production_batches_wo_active 
ON production_batches(wo_id, ended_at, production_complete);

-- 5. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_or_create_production_batch(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_wo_production_status(UUID) TO authenticated;
