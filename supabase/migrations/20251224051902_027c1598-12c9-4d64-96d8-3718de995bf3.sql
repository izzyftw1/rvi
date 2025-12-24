-- Add qty_dispatched column to work_orders (sum of all dispatches)
ALTER TABLE public.work_orders
ADD COLUMN IF NOT EXISTS qty_dispatched integer DEFAULT 0;

-- Create function to compute detailed WO status based on batches
CREATE OR REPLACE FUNCTION public.get_wo_batch_status(p_wo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_ordered integer;
  v_base_status text;
  v_total_produced integer;
  v_total_qc_approved integer;
  v_total_qc_rejected integer;
  v_total_dispatched integer;
  v_active_batch_count integer;
  v_has_pending_qc boolean;
  v_computed_status text;
BEGIN
  -- Get ordered quantity and base status
  SELECT quantity, status::text INTO v_ordered, v_base_status
  FROM work_orders
  WHERE id = p_wo_id;
  
  IF v_ordered IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Aggregate from batches
  SELECT 
    COALESCE(SUM(produced_qty), 0),
    COALESCE(SUM(qc_approved_qty), 0),
    COALESCE(SUM(qc_rejected_qty), 0),
    COALESCE(SUM(dispatched_qty), 0),
    COUNT(*) FILTER (WHERE ended_at IS NULL)
  INTO v_total_produced, v_total_qc_approved, v_total_qc_rejected, v_total_dispatched, v_active_batch_count
  FROM production_batches
  WHERE wo_id = p_wo_id;
  
  -- Check for pending QC
  v_has_pending_qc := v_total_produced > (v_total_qc_approved + v_total_qc_rejected);
  
  -- Determine computed status based on quantities
  v_computed_status := CASE
    -- Fully Dispatched - all ordered qty dispatched
    WHEN v_total_dispatched >= v_ordered THEN 'fully_dispatched'
    
    -- Partially Dispatched with no active batch - awaiting next production
    WHEN v_total_dispatched > 0 AND v_total_dispatched < v_ordered AND v_active_batch_count = 0 THEN 'awaiting_next_batch'
    
    -- Partially Dispatched with active batch
    WHEN v_total_dispatched > 0 AND v_total_dispatched < v_ordered THEN 'partially_dispatched'
    
    -- Has QC approved but not all dispatched - ready for dispatch
    WHEN v_total_qc_approved > v_total_dispatched AND v_total_qc_approved > 0 THEN 'ready_to_dispatch'
    
    -- Partially QC Approved (some produced, some approved, some pending)
    WHEN v_total_qc_approved > 0 AND v_has_pending_qc THEN 'partially_qc_approved'
    
    -- In Production - has production activity
    WHEN v_total_produced > 0 OR v_active_batch_count > 0 THEN 'in_production'
    
    -- Base status mapping for legacy
    WHEN v_base_status = 'completed' THEN 'closed'
    WHEN v_base_status = 'shipped' THEN 'fully_dispatched'
    WHEN v_base_status = 'packing' THEN 'packing'
    WHEN v_base_status = 'qc' THEN 'in_qc'
    WHEN v_base_status = 'in_progress' THEN 'in_production'
    
    -- Pending (no production yet)
    ELSE 'pending'
  END;
  
  v_result := jsonb_build_object(
    'status', v_computed_status,
    'base_status', v_base_status,
    'ordered_qty', v_ordered,
    'produced_qty', v_total_produced,
    'qc_approved_qty', v_total_qc_approved,
    'qc_rejected_qty', v_total_qc_rejected,
    'qc_pending_qty', GREATEST(0, v_total_produced - v_total_qc_approved - v_total_qc_rejected),
    'dispatched_qty', v_total_dispatched,
    'remaining_qty', GREATEST(0, v_ordered - v_total_dispatched),
    'active_batches', v_active_batch_count,
    'has_pending_qc', v_has_pending_qc
  );
  
  RETURN v_result;
END;
$$;

-- Trigger to sync qty_dispatched from dispatches table
CREATE OR REPLACE FUNCTION public.sync_wo_dispatched_qty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wo_id uuid;
  v_total integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_wo_id := OLD.wo_id;
  ELSE
    v_wo_id := NEW.wo_id;
  END IF;
  
  -- Calculate total dispatched for this WO
  SELECT COALESCE(SUM(quantity), 0) INTO v_total
  FROM dispatches
  WHERE wo_id = v_wo_id;
  
  -- Update work order
  UPDATE work_orders
  SET qty_dispatched = v_total
  WHERE id = v_wo_id;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS sync_wo_dispatched_trigger ON public.dispatches;
CREATE TRIGGER sync_wo_dispatched_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.dispatches
FOR EACH ROW
EXECUTE FUNCTION public.sync_wo_dispatched_qty();