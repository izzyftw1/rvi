-- Fix validate_and_update_dispatch trigger to use dispatch_qc_batches as SSOT
-- REMOVE check against production_batches.qc_final_status
-- INSTEAD check dispatch_qc_batches.status = 'approved'

CREATE OR REPLACE FUNCTION validate_and_update_dispatch()
RETURNS TRIGGER AS $$
DECLARE
  v_batch_record record;
  v_packed_qty integer;
  v_available_for_dispatch integer;
  v_wo_quantity integer;
  v_total_dispatched integer;
  v_overdispatch_tolerance numeric := 0.10; -- Allow 10% over-dispatch
  v_dispatch_qc_approved boolean;
  v_dispatch_qc_status text;
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
  
  -- RULE: Check dispatch_qc_batches for approval (SSOT - NOT production_batches.qc_final_status)
  -- Find approved dispatch QC batch for this work order
  SELECT EXISTS(
    SELECT 1 FROM dispatch_qc_batches 
    WHERE work_order_id = NEW.wo_id 
    AND status = 'approved'
    AND (qc_approved_quantity - consumed_quantity) > 0
  ) INTO v_dispatch_qc_approved;
  
  -- Get status for error message if not approved
  IF NOT v_dispatch_qc_approved THEN
    SELECT status INTO v_dispatch_qc_status 
    FROM dispatch_qc_batches 
    WHERE work_order_id = NEW.wo_id 
    ORDER BY created_at DESC 
    LIMIT 1;
    
    RAISE EXCEPTION 'Cannot dispatch - Dispatch QC not approved for this work order (status: %)', 
      COALESCE(v_dispatch_qc_status, 'none');
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;