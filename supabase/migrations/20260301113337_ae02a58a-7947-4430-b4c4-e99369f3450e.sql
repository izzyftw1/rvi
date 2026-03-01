
-- ============================================================
-- P0 FIX 1: Unique constraint on qc_records to prevent duplicates
-- ============================================================
-- First clean up any existing duplicates (keep most recent)
DELETE FROM public.qc_records
WHERE id NOT IN (
  SELECT DISTINCT ON (wo_id, qc_type, COALESCE(batch_id, '00000000-0000-0000-0000-000000000000'))
    id
  FROM public.qc_records
  ORDER BY wo_id, qc_type, COALESCE(batch_id, '00000000-0000-0000-0000-000000000000'), created_at DESC
);

-- Create unique index (using COALESCE for nullable batch_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_qc_records_wo_type_batch
ON public.qc_records (wo_id, qc_type, COALESCE(batch_id, '00000000-0000-0000-0000-000000000000'));

-- ============================================================
-- P0 FIX 2: Consolidate 6 redundant QC sync triggers into 1
-- ============================================================
-- Drop all existing QC sync triggers
DROP TRIGGER IF EXISTS trigger_sync_wo_qc_status ON public.qc_records;
DROP TRIGGER IF EXISTS tr_sync_qc_to_wo ON public.qc_records;
DROP TRIGGER IF EXISTS trigger_update_wo_qc_status ON public.qc_records;

-- Drop old functions
DROP FUNCTION IF EXISTS public.sync_wo_qc_status() CASCADE;
DROP FUNCTION IF EXISTS public.sync_qc_to_wo() CASCADE;
DROP FUNCTION IF EXISTS public.update_wo_qc_status() CASCADE;

-- Create single consolidated function
CREATE OR REPLACE FUNCTION public.unified_sync_qc_to_wo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result text;
  v_status text;
  v_passed boolean;
BEGIN
  v_result := NEW.result::text;

  -- Map qc_result enum to work_order status values
  CASE v_result
    WHEN 'pass' THEN v_status := 'passed'; v_passed := true;
    WHEN 'fail' THEN v_status := 'failed'; v_passed := false;
    WHEN 'rework' THEN v_status := 'hold'; v_passed := false;
    ELSE v_status := 'pending'; v_passed := false;
  END CASE;

  -- Check if waived (waive_reason populated means waived pass)
  IF NEW.waive_reason IS NOT NULL AND NEW.waive_reason != '' THEN
    v_status := 'waived';
    v_passed := true;
  END IF;

  -- Update appropriate work_order fields based on qc_type
  IF NEW.qc_type = 'incoming' THEN
    UPDATE work_orders SET
      qc_material_status = v_status,
      qc_material_passed = v_passed,
      qc_material_approved_by = NEW.approved_by,
      qc_material_approved_at = NEW.approved_at,
      qc_material_remarks = NEW.remarks,
      qc_raw_material_status = v_status,
      qc_raw_material_approved_by = NEW.approved_by,
      qc_raw_material_approved_at = NEW.approved_at,
      qc_raw_material_remarks = NEW.remarks
    WHERE id = NEW.wo_id;

  ELSIF NEW.qc_type = 'first_piece' THEN
    UPDATE work_orders SET
      qc_first_piece_status = v_status,
      qc_first_piece_passed = v_passed,
      qc_first_piece_approved_by = NEW.approved_by,
      qc_first_piece_approved_at = NEW.approved_at,
      qc_first_piece_remarks = NEW.remarks
    WHERE id = NEW.wo_id;

  ELSIF NEW.qc_type = 'final' THEN
    UPDATE work_orders SET
      qc_final_status = v_status,
      qc_final_approved_by = NEW.approved_by,
      qc_final_approved_at = NEW.approved_at,
      qc_final_remarks = NEW.remarks,
      final_qc_result = v_status
    WHERE id = NEW.wo_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Single trigger for all QC record changes
CREATE TRIGGER trg_unified_qc_sync
AFTER INSERT OR UPDATE ON public.qc_records
FOR EACH ROW
EXECUTE FUNCTION public.unified_sync_qc_to_wo();

-- ============================================================
-- P0 FIX 3: DB function to validate QC gates before production log
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_production_qc_gates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mat_status text;
  v_fp_status text;
BEGIN
  -- Only check if a work order is linked
  IF NEW.wo_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT qc_material_status, qc_first_piece_status
  INTO v_mat_status, v_fp_status
  FROM work_orders
  WHERE id = NEW.wo_id;

  -- Block if material QC has explicitly failed (not pending - pending allows first run)
  IF v_mat_status = 'failed' THEN
    RAISE EXCEPTION 'Production blocked: Raw Material QC has FAILED for this work order. Resolve QC before logging production.';
  END IF;

  -- Block if first piece QC has explicitly failed
  IF v_fp_status = 'failed' THEN
    RAISE EXCEPTION 'Production blocked: First Piece QC has FAILED for this work order. Resolve QC before logging production.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_prod_qc_gates ON public.daily_production_logs;
CREATE TRIGGER trg_validate_prod_qc_gates
BEFORE INSERT ON public.daily_production_logs
FOR EACH ROW
EXECUTE FUNCTION public.validate_production_qc_gates();

-- ============================================================
-- P1 FIX 1: Auto-create QC record on work order creation (incoming)
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_create_qc_incoming_on_wo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only on new work orders
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.qc_records (qc_id, wo_id, qc_type, result, remarks)
    VALUES (
      'QC-MAT-' || upper(to_hex(extract(epoch from now())::bigint)),
      NEW.id,
      'incoming',
      'pending',
      'Auto-created on work order creation'
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_qc_incoming ON public.work_orders;
DROP TRIGGER IF EXISTS tr_auto_create_qc_incoming ON public.work_orders;
CREATE TRIGGER trg_auto_create_qc_incoming
AFTER INSERT ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_qc_incoming_on_wo();

-- ============================================================
-- P1 FIX 2: Auto-create post-external QC record on external return
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_create_post_external_qc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When external move status changes to 'returned' or quantity_returned increases
  IF (NEW.status = 'returned' OR NEW.quantity_returned > COALESCE(OLD.quantity_returned, 0)) THEN
    INSERT INTO public.qc_records (qc_id, wo_id, batch_id, qc_type, result, remarks)
    VALUES (
      'QC-EXT-' || upper(to_hex(extract(epoch from now())::bigint)),
      NEW.wo_id,
      NEW.batch_id,
      'in_process',
      'pending',
      'Auto-created: Post-external return QC required'
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_qc_external_return ON public.wo_external_moves;
CREATE TRIGGER trg_auto_qc_external_return
AFTER UPDATE ON public.wo_external_moves
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status OR NEW.quantity_returned IS DISTINCT FROM OLD.quantity_returned)
EXECUTE FUNCTION public.auto_create_post_external_qc();
