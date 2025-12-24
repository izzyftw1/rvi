-- Update dispatch validation to ensure dispatch quantity comes from packed cartons
CREATE OR REPLACE FUNCTION public.validate_and_update_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_batch_record record;
  v_packed_qty integer;
  v_available_for_dispatch integer;
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
  
  -- Get packed quantity from cartons for this batch
  SELECT COALESCE(SUM(quantity), 0) INTO v_packed_qty
  FROM cartons
  WHERE batch_id = NEW.batch_id;
  
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
$function$;

-- Update get_batch_dispatchable_qty to use packed cartons
CREATE OR REPLACE FUNCTION public.get_batch_dispatchable_qty(p_batch_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_packed_qty integer;
  v_dispatched_qty integer;
BEGIN
  -- Get packed quantity from cartons
  SELECT COALESCE(SUM(quantity), 0) INTO v_packed_qty
  FROM cartons
  WHERE batch_id = p_batch_id;
  
  -- Get already dispatched quantity
  SELECT COALESCE(dispatched_qty, 0) INTO v_dispatched_qty
  FROM production_batches
  WHERE id = p_batch_id;
  
  -- Return available: packed - dispatched
  RETURN GREATEST(0, v_packed_qty - COALESCE(v_dispatched_qty, 0));
END;
$function$;