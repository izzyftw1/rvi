-- Enhanced dispatch validation: require Final QC approval
CREATE OR REPLACE FUNCTION public.validate_and_update_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_available integer;
  v_batch_wo_id uuid;
  v_batch_record record;
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
  IF v_batch_record.qc_final_status != 'passed' THEN
    RAISE EXCEPTION 'Cannot dispatch from batch #% - Final QC not approved (status: %)', 
      v_batch_record.batch_number, 
      COALESCE(v_batch_record.qc_final_status, 'pending');
  END IF;
  
  -- RULE: Dispatch must use this batch's own QC approval (not inherited)
  IF v_batch_record.qc_final_approved_at IS NULL THEN
    RAISE EXCEPTION 'Cannot dispatch from batch #% - No QC approval record found for this batch', 
      v_batch_record.batch_number;
  END IF;
  
  -- Get available dispatchable quantity
  v_available := get_batch_dispatchable_qty(NEW.batch_id);
  
  -- Validate quantity
  IF NEW.quantity > v_available THEN
    RAISE EXCEPTION 'Cannot dispatch % pcs. Only % pcs available (QC approved - already dispatched)', 
      NEW.quantity, v_available;
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
$function$;

-- Audit trigger for batch creation
CREATE OR REPLACE FUNCTION public.audit_batch_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (
    table_name,
    record_id,
    action,
    new_data,
    changed_by
  ) VALUES (
    'production_batches',
    NEW.id,
    'BATCH_CREATED',
    jsonb_build_object(
      'batch_number', NEW.batch_number,
      'wo_id', NEW.wo_id,
      'trigger_reason', NEW.trigger_reason,
      'previous_batch_id', NEW.previous_batch_id,
      'started_at', NEW.started_at
    ),
    COALESCE(NEW.created_by, auth.uid())
  );
  
  RETURN NEW;
END;
$function$;

-- Audit trigger for QC approvals on batches
CREATE OR REPLACE FUNCTION public.audit_batch_qc_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_action text;
  v_details jsonb;
BEGIN
  -- Track Material QC changes
  IF (OLD.qc_material_status IS DISTINCT FROM NEW.qc_material_status) AND NEW.qc_material_status IN ('passed', 'failed', 'waived') THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (
      'production_batches',
      NEW.id,
      'QC_MATERIAL_' || UPPER(NEW.qc_material_status),
      jsonb_build_object('qc_material_status', OLD.qc_material_status),
      jsonb_build_object(
        'batch_number', NEW.batch_number,
        'wo_id', NEW.wo_id,
        'qc_material_status', NEW.qc_material_status,
        'approved_by', NEW.qc_material_approved_by,
        'approved_at', NEW.qc_material_approved_at
      ),
      COALESCE(NEW.qc_material_approved_by, auth.uid())
    );
  END IF;
  
  -- Track First Piece QC changes
  IF (OLD.qc_first_piece_status IS DISTINCT FROM NEW.qc_first_piece_status) AND NEW.qc_first_piece_status IN ('passed', 'failed', 'waived') THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (
      'production_batches',
      NEW.id,
      'QC_FIRST_PIECE_' || UPPER(NEW.qc_first_piece_status),
      jsonb_build_object('qc_first_piece_status', OLD.qc_first_piece_status),
      jsonb_build_object(
        'batch_number', NEW.batch_number,
        'wo_id', NEW.wo_id,
        'qc_first_piece_status', NEW.qc_first_piece_status,
        'approved_by', NEW.qc_first_piece_approved_by,
        'approved_at', NEW.qc_first_piece_approved_at
      ),
      COALESCE(NEW.qc_first_piece_approved_by, auth.uid())
    );
  END IF;
  
  -- Track Final QC changes
  IF (OLD.qc_final_status IS DISTINCT FROM NEW.qc_final_status) AND NEW.qc_final_status IN ('passed', 'failed', 'waived') THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (
      'production_batches',
      NEW.id,
      'QC_FINAL_' || UPPER(NEW.qc_final_status),
      jsonb_build_object('qc_final_status', OLD.qc_final_status),
      jsonb_build_object(
        'batch_number', NEW.batch_number,
        'wo_id', NEW.wo_id,
        'qc_final_status', NEW.qc_final_status,
        'qc_approved_qty', NEW.qc_approved_qty,
        'qc_rejected_qty', NEW.qc_rejected_qty,
        'approved_by', NEW.qc_final_approved_by,
        'approved_at', NEW.qc_final_approved_at
      ),
      COALESCE(NEW.qc_final_approved_by, auth.uid())
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Audit trigger for dispatches
CREATE OR REPLACE FUNCTION public.audit_dispatch_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_batch_info record;
  v_wo_info record;
BEGIN
  -- Get batch info
  SELECT batch_number, wo_id INTO v_batch_info
  FROM production_batches
  WHERE id = NEW.batch_id;
  
  -- Get work order info
  SELECT display_id, customer, item_code INTO v_wo_info
  FROM work_orders
  WHERE id = NEW.wo_id;
  
  INSERT INTO public.audit_logs (
    table_name,
    record_id,
    action,
    new_data,
    changed_by
  ) VALUES (
    'dispatches',
    NEW.id,
    'DISPATCH_CREATED',
    jsonb_build_object(
      'wo_id', NEW.wo_id,
      'wo_display_id', v_wo_info.display_id,
      'customer', v_wo_info.customer,
      'item_code', v_wo_info.item_code,
      'batch_id', NEW.batch_id,
      'batch_number', v_batch_info.batch_number,
      'quantity', NEW.quantity,
      'shipment_id', NEW.shipment_id,
      'remarks', NEW.remarks,
      'dispatched_at', NEW.dispatched_at
    ),
    COALESCE(NEW.dispatched_by, auth.uid())
  );
  
  RETURN NEW;
END;
$function$;

-- Create triggers (drop if exist first)
DROP TRIGGER IF EXISTS trg_audit_batch_creation ON production_batches;
CREATE TRIGGER trg_audit_batch_creation
  AFTER INSERT ON production_batches
  FOR EACH ROW
  EXECUTE FUNCTION audit_batch_creation();

DROP TRIGGER IF EXISTS trg_audit_batch_qc_approval ON production_batches;
CREATE TRIGGER trg_audit_batch_qc_approval
  AFTER UPDATE ON production_batches
  FOR EACH ROW
  EXECUTE FUNCTION audit_batch_qc_approval();

DROP TRIGGER IF EXISTS trg_audit_dispatch_creation ON dispatches;
CREATE TRIGGER trg_audit_dispatch_creation
  AFTER INSERT ON dispatches
  FOR EACH ROW
  EXECUTE FUNCTION audit_dispatch_creation();

-- Ensure new batches start with fresh QC status (no inheritance)
CREATE OR REPLACE FUNCTION public.get_or_create_production_batch(p_wo_id uuid, p_gap_threshold_days integer DEFAULT 7)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_batch_id UUID;
  v_last_batch RECORD;
  v_last_log_date DATE;
  v_last_dispatch_date TIMESTAMP WITH TIME ZONE;
  v_new_batch_number INTEGER;
  v_trigger_reason TEXT;
BEGIN
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
      -- Explicitly set QC statuses to pending (no inheritance)
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

  -- Determine if we need a new batch
  v_trigger_reason := NULL;

  -- Case 1: Dispatch occurred after batch started - need new batch for resumed production
  IF v_last_dispatch_date IS NOT NULL THEN
    v_trigger_reason := 'post_dispatch';
  -- Case 2: Gap in production (no logs for threshold days)
  ELSIF v_last_log_date IS NOT NULL AND (CURRENT_DATE - v_last_log_date) > p_gap_threshold_days THEN
    v_trigger_reason := 'gap_restart';
  END IF;

  -- Create new batch if needed (NO QC INHERITANCE - fresh start)
  IF v_trigger_reason IS NOT NULL THEN
    v_new_batch_number := v_last_batch.batch_number + 1;
    
    -- Close the previous batch
    UPDATE production_batches
    SET ended_at = now()
    WHERE id = v_last_batch.id
      AND ended_at IS NULL;
    
    -- Create new batch with fresh QC statuses (NOT inherited from previous batch)
    INSERT INTO production_batches (
      wo_id, 
      batch_number, 
      trigger_reason, 
      previous_batch_id,
      -- All QC statuses start fresh
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
      v_new_batch_number, 
      v_trigger_reason, 
      v_last_batch.id,
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

  -- Return existing batch
  RETURN v_last_batch.id;
END;
$function$;