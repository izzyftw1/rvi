
-- Update check_wo_production_status to include Final QC and Packing requirements
-- WO is complete when:
-- 1. All batches have production_complete = true OR ended_at IS NOT NULL
-- 2. Total produced_qty >= ordered quantity
-- 3. All batches have qc_final_status = 'passed' or 'waived'  
-- 4. Total packed qty > 0 (sent to packing)

CREATE OR REPLACE FUNCTION public.check_wo_completion_status(p_wo_id UUID)
RETURNS TABLE(
  all_batches_production_complete BOOLEAN,
  all_batches_final_qc_complete BOOLEAN,
  has_packed_qty BOOLEAN,
  total_produced INTEGER,
  total_final_qc_approved INTEGER,
  total_packed INTEGER,
  total_dispatched INTEGER,
  ordered_qty INTEGER,
  can_mark_wo_complete BOOLEAN,
  active_batch_id UUID,
  completion_blockers TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ordered INTEGER;
  v_produced INTEGER;
  v_final_qc_approved INTEGER;
  v_packed INTEGER;
  v_dispatched INTEGER;
  v_all_production_complete BOOLEAN;
  v_all_final_qc_complete BOOLEAN;
  v_active_batch UUID;
  v_blockers TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Get WO quantity
  SELECT quantity INTO v_ordered FROM work_orders WHERE id = p_wo_id;
  
  -- Get batch aggregates
  SELECT 
    COALESCE(SUM(produced_qty), 0),
    COALESCE(SUM(qc_approved_qty), 0),
    COALESCE(SUM(dispatched_qty), 0),
    bool_and(production_complete = true OR ended_at IS NOT NULL),
    bool_and(qc_final_status IN ('passed', 'waived'))
  INTO v_produced, v_final_qc_approved, v_dispatched, v_all_production_complete, v_all_final_qc_complete
  FROM production_batches
  WHERE wo_id = p_wo_id;
  
  -- Get packed quantity from cartons
  SELECT COALESCE(SUM(c.quantity), 0) INTO v_packed
  FROM cartons c
  WHERE c.wo_id = p_wo_id;
  
  -- Get active batch (if any)
  SELECT id INTO v_active_batch
  FROM production_batches
  WHERE wo_id = p_wo_id
    AND ended_at IS NULL
    AND production_complete = false
  ORDER BY batch_number DESC
  LIMIT 1;
  
  -- Build blockers list
  IF NOT COALESCE(v_all_production_complete, false) THEN
    v_blockers := array_append(v_blockers, 'Production not complete for all batches');
  END IF;
  
  IF COALESCE(v_produced, 0) < COALESCE(v_ordered, 0) THEN
    v_blockers := array_append(v_blockers, 'Produced qty (' || v_produced || ') < ordered qty (' || v_ordered || ')');
  END IF;
  
  IF NOT COALESCE(v_all_final_qc_complete, false) THEN
    v_blockers := array_append(v_blockers, 'Final QC not complete for all batches');
  END IF;
  
  IF COALESCE(v_packed, 0) = 0 THEN
    v_blockers := array_append(v_blockers, 'No quantity packed yet');
  END IF;
  
  RETURN QUERY SELECT 
    COALESCE(v_all_production_complete, false),
    COALESCE(v_all_final_qc_complete, false),
    COALESCE(v_packed, 0) > 0,
    COALESCE(v_produced, 0),
    COALESCE(v_final_qc_approved, 0),
    COALESCE(v_packed, 0),
    COALESCE(v_dispatched, 0),
    COALESCE(v_ordered, 0),
    -- Can mark complete: all 4 conditions met
    (COALESCE(v_all_production_complete, false) 
     AND COALESCE(v_produced, 0) >= COALESCE(v_ordered, 0)
     AND COALESCE(v_all_final_qc_complete, false) 
     AND COALESCE(v_packed, 0) > 0),
    v_active_batch,
    v_blockers;
END;
$$;

-- Update the original function to use the new comprehensive check
CREATE OR REPLACE FUNCTION public.check_wo_production_status(p_wo_id UUID)
RETURNS TABLE(
  all_batches_complete BOOLEAN,
  total_produced INTEGER,
  ordered_qty INTEGER,
  can_mark_wo_complete BOOLEAN,
  active_batch_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result RECORD;
BEGIN
  -- Use the comprehensive check
  SELECT * INTO v_result FROM public.check_wo_completion_status(p_wo_id);
  
  RETURN QUERY SELECT 
    v_result.all_batches_production_complete,
    v_result.total_produced,
    v_result.ordered_qty,
    v_result.can_mark_wo_complete,
    v_result.active_batch_id;
END;
$$;

-- Add function to mark WO as complete (with validation)
CREATE OR REPLACE FUNCTION public.mark_wo_complete(p_wo_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status RECORD;
BEGIN
  -- Check completion status
  SELECT * INTO v_status FROM public.check_wo_completion_status(p_wo_id);
  
  IF NOT v_status.can_mark_wo_complete THEN
    RAISE EXCEPTION 'Cannot mark WO complete. Blockers: %', array_to_string(v_status.completion_blockers, ', ');
  END IF;
  
  -- Mark the WO as complete
  UPDATE work_orders
  SET 
    status = 'completed',
    production_complete = true,
    updated_at = NOW()
  WHERE id = p_wo_id;
  
  -- Log the completion
  INSERT INTO audit_logs (table_name, record_id, action, new_data, changed_by)
  VALUES (
    'work_orders',
    p_wo_id,
    'WO_COMPLETED',
    jsonb_build_object(
      'total_produced', v_status.total_produced,
      'total_packed', v_status.total_packed,
      'total_dispatched', v_status.total_dispatched,
      'ordered_qty', v_status.ordered_qty
    ),
    auth.uid()
  );
  
  RETURN true;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.check_wo_completion_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_wo_complete(UUID) TO authenticated;
