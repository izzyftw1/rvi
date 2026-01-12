-- Dispatch validation MUST be carton-scoped (not WO-scoped)
-- Validate ONLY using the dispatch_qc_batches row linked to the selected carton (or its production batch)

CREATE OR REPLACE FUNCTION public.validate_and_update_dispatch()
RETURNS TRIGGER AS $$
DECLARE
  v_batch_record record;
  v_packed_qty integer;
  v_available_for_dispatch integer;
  v_overdispatch_tolerance numeric := 0.10; -- Allow 10% over-dispatch

  v_carton record;
  v_dqb record;
  v_dqb_id uuid;
  v_fallback_prod_batch_id uuid;
BEGIN
  -- Get batch details
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

  -- =============================================================
  -- SSOT VALIDATION: Dispatch QC must be validated PER CARTON
  -- - Do NOT use work_order-level QC / status flags
  -- - Use cartons.dispatch_qc_batch_id (preferred) or carton/batch linkage
  -- =============================================================

  v_dqb_id := NULL;

  IF NEW.carton_id IS NOT NULL THEN
    SELECT id, wo_id, carton_id, dispatch_qc_batch_id, production_batch_id
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

    -- Preferred: explicit link
    v_dqb_id := v_carton.dispatch_qc_batch_id;

    -- Fallback: link by production batch (carton.production_batch_id first, otherwise NEW.batch_id)
    IF v_dqb_id IS NULL THEN
      v_fallback_prod_batch_id := COALESCE(v_carton.production_batch_id, NEW.batch_id);
      SELECT id INTO v_dqb_id
      FROM public.dispatch_qc_batches
      WHERE production_batch_id = v_fallback_prod_batch_id
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;
  ELSE
    -- If dispatch has no carton_id, fall back to batch linkage (still NOT WO-scoped)
    SELECT id INTO v_dqb_id
    FROM public.dispatch_qc_batches
    WHERE production_batch_id = NEW.batch_id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_dqb_id IS NULL THEN
    RAISE EXCEPTION 'Cannot dispatch - No Dispatch QC batch linked to this carton/batch';
  END IF;

  SELECT status, qc_approved_quantity, consumed_quantity
  INTO v_dqb
  FROM public.dispatch_qc_batches
  WHERE id = v_dqb_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot dispatch - Dispatch QC batch not found';
  END IF;

  -- IMPORTANT:
  -- dispatch_qc_batches.status is derived from consumed_quantity (approved/partially_consumed/consumed)
  -- Treat these as approved QC states; only absence of a linked QC batch blocks dispatch.
  IF v_dqb.status NOT IN ('approved', 'partially_consumed', 'consumed') THEN
    RAISE EXCEPTION 'Cannot dispatch - Dispatch QC not approved for selected carton (status: %)', COALESCE(v_dqb.status, 'none');
  END IF;

  -- Get packed quantity from cartons for this batch
  SELECT COALESCE(SUM(quantity), 0) INTO v_packed_qty
  FROM public.cartons
  WHERE (batch_id = NEW.batch_id OR production_batch_id = NEW.batch_id);

  -- Calculate available for dispatch: packed_qty - already_dispatched
  v_available_for_dispatch := v_packed_qty - COALESCE(v_batch_record.dispatched_qty, 0);

  IF v_packed_qty = 0 THEN
    RAISE EXCEPTION 'Cannot dispatch from batch #% - No cartons packed yet', v_batch_record.batch_number;
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
  UPDATE public.production_batches
  SET dispatched_qty = COALESCE(dispatched_qty, 0) + NEW.quantity
  WHERE id = NEW.batch_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;