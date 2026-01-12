-- Fix validate_and_update_dispatch to check cartons correctly
-- The cartons don't have production_batch_id set, so we must:
-- 1. Check cartons directly by carton_id (preferred)
-- 2. OR check cartons by wo_id as fallback
-- The key change: v_packed_qty query should find cartons by carton_id or wo_id, not by production_batch_id

CREATE OR REPLACE FUNCTION public.validate_and_update_dispatch()
RETURNS TRIGGER AS $$
DECLARE
  v_batch_record record;
  v_packed_qty integer;
  v_available_for_dispatch integer;
  v_overdispatch_tolerance numeric := 0.10;

  v_carton record;
  v_dqb record;
  v_dqb_id uuid;
BEGIN
  -- Get batch details (required for FK constraint)
  SELECT * INTO v_batch_record
  FROM public.production_batches
  WHERE id = NEW.batch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid batch_id: Batch not found';
  END IF;

  -- Validate batch belongs to the work order
  IF v_batch_record.wo_id != NEW.wo_id THEN
    RAISE EXCEPTION 'Batch does not belong to this work order';
  END IF;

  -- ============================================================
  -- CARTON-BASED VALIDATION (Not production_batch based)
  -- ============================================================

  IF NEW.carton_id IS NOT NULL THEN
    -- Get the carton being dispatched
    SELECT id, wo_id, carton_id, dispatch_qc_batch_id, production_batch_id, quantity
    INTO v_carton
    FROM public.cartons
    WHERE id = NEW.carton_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid carton_id: Carton not found';
    END IF;

    -- Ensure carton belongs to same WO
    IF v_carton.wo_id IS DISTINCT FROM NEW.wo_id THEN
      RAISE EXCEPTION 'Carton does not belong to this work order';
    END IF;

    -- Get dispatch QC batch from carton (SSOT)
    v_dqb_id := v_carton.dispatch_qc_batch_id;

    IF v_dqb_id IS NULL THEN
      RAISE EXCEPTION 'Cannot dispatch - Carton has no linked Dispatch QC batch';
    END IF;

    SELECT status, qc_approved_quantity, consumed_quantity
    INTO v_dqb
    FROM public.dispatch_qc_batches
    WHERE id = v_dqb_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cannot dispatch - Dispatch QC batch not found';
    END IF;

    -- Dispatch QC status check: approved, partially_consumed, consumed are all valid
    -- These are derived statuses based on consumption, not rejection
    IF v_dqb.status NOT IN ('approved', 'partially_consumed', 'consumed') THEN
      RAISE EXCEPTION 'Cannot dispatch - Dispatch QC not approved (status: %)', COALESCE(v_dqb.status, 'none');
    END IF;

    -- Get packed qty for THIS CARTON (not by production_batch_id)
    v_packed_qty := v_carton.quantity;

    -- Calculate available: carton quantity - already dispatched from this carton
    SELECT COALESCE(SUM(quantity), 0) INTO v_available_for_dispatch
    FROM public.dispatches
    WHERE carton_id = NEW.carton_id;
    
    v_available_for_dispatch := v_packed_qty - v_available_for_dispatch;

    IF NEW.quantity > v_available_for_dispatch THEN
      RAISE EXCEPTION 'Cannot dispatch % pcs from carton. Only % pcs available',
        NEW.quantity, v_available_for_dispatch;
    END IF;

  ELSE
    -- Fallback: no carton_id - check by WO-level dispatch_qc_batches (legacy path)
    SELECT status INTO v_dqb
    FROM public.dispatch_qc_batches
    WHERE work_order_id = NEW.wo_id
    AND status IN ('approved', 'partially_consumed', 'consumed')
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cannot dispatch - No approved Dispatch QC batch for this work order';
    END IF;

    -- Get total packed qty for this WO
    SELECT COALESCE(SUM(quantity), 0) INTO v_packed_qty
    FROM public.cartons
    WHERE wo_id = NEW.wo_id AND status IN ('ready_for_dispatch', 'dispatched');

    IF v_packed_qty = 0 THEN
      RAISE EXCEPTION 'Cannot dispatch - No cartons packed for this work order';
    END IF;

    -- Check available qty
    SELECT COALESCE(SUM(quantity), 0) INTO v_available_for_dispatch
    FROM public.dispatches
    WHERE wo_id = NEW.wo_id;
    
    v_available_for_dispatch := v_packed_qty - v_available_for_dispatch;

    IF NEW.quantity > v_available_for_dispatch THEN
      RAISE EXCEPTION 'Cannot dispatch % pcs. Only % pcs available for WO',
        NEW.quantity, v_available_for_dispatch;
    END IF;
  END IF;

  IF NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Dispatch quantity must be greater than 0';
  END IF;

  -- Update production batch dispatched qty for tracking
  UPDATE public.production_batches
  SET dispatched_qty = COALESCE(dispatched_qty, 0) + NEW.quantity
  WHERE id = NEW.batch_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;