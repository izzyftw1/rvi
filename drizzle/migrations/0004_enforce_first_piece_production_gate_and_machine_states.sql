ALTER TYPE public.run_state ADD VALUE IF NOT EXISTS 'breakdown';
ALTER TYPE public.run_state ADD VALUE IF NOT EXISTS 'idle';
ALTER TYPE public.run_state ADD VALUE IF NOT EXISTS 'qc_hold';

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
  IF NEW.wo_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT qc_material_status, qc_first_piece_status
  INTO v_mat_status, v_fp_status
  FROM public.work_orders
  WHERE id = NEW.wo_id
  FOR SHARE;

  IF v_fp_status IS DISTINCT FROM 'passed' THEN
    RAISE EXCEPTION 'First-piece QC not approved for this work order';
  END IF;

  IF v_mat_status = 'failed' THEN
    RAISE EXCEPTION 'Production blocked: Raw Material QC has FAILED for this work order. Resolve QC before logging production.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_prod_qc_gates ON public.daily_production_logs;
CREATE TRIGGER trg_validate_prod_qc_gates
BEFORE INSERT ON public.daily_production_logs
FOR EACH ROW EXECUTE FUNCTION public.validate_production_qc_gates();