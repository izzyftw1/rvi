CREATE TABLE public.final_qc_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  wo_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  result text NOT NULL CHECK (result IN ('pass','fail','hold')),
  inspected_qty integer NOT NULL DEFAULT 0 CHECK (inspected_qty >= 0),
  accepted_qty integer NOT NULL DEFAULT 0 CHECK (accepted_qty >= 0),
  rejected_qty integer NOT NULL DEFAULT 0 CHECK (rejected_qty >= 0),
  disposition text CHECK (disposition IN ('rework','scrap','ncr')),
  inspector_id uuid,
  remarks text,
  ncr_id uuid REFERENCES public.ncrs(id),
  system_backfill boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_final_qc_inspections_batch ON public.final_qc_inspections(batch_id);
CREATE INDEX idx_final_qc_inspections_wo ON public.final_qc_inspections(wo_id);

GRANT SELECT, INSERT ON public.final_qc_inspections TO authenticated;
GRANT ALL ON public.final_qc_inspections TO service_role;
ALTER TABLE public.final_qc_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Final QC departments can view inspections" ON public.final_qc_inspections
FOR SELECT TO authenticated
USING (public.has_any_department_type(auth.uid(), ARRAY['quality','production','admin','super_admin','packing']) OR public.is_admin_user(auth.uid()));

CREATE POLICY "Final QC departments can record inspections" ON public.final_qc_inspections
FOR INSERT TO authenticated
WITH CHECK ((public.has_any_department_type(auth.uid(), ARRAY['quality','production','admin','super_admin']) OR public.is_admin_user(auth.uid())) AND inspector_id = auth.uid());

CREATE OR REPLACE FUNCTION public.record_final_qc(
  p_batch_id uuid, p_result text, p_inspected_qty integer, p_accepted_qty integer,
  p_rejected_qty integer, p_disposition text, p_remarks text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_batch production_batches%ROWTYPE;
  v_wo_number text;
  v_ncr_id uuid;
  v_ncr_number text;
  v_id uuid;
  v_already_inspected integer;
  v_max integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_any_department_type(v_uid, ARRAY['quality','production','admin','super_admin']) OR public.is_admin_user(v_uid)) THEN
    RAISE EXCEPTION 'Only Quality, Production or Admin can record Final QC';
  END IF;
  IF p_result NOT IN ('pass','fail','hold') THEN RAISE EXCEPTION 'Result must be pass, fail or hold'; END IF;
  IF coalesce(p_inspected_qty,0) <= 0 THEN RAISE EXCEPTION 'Inspected quantity must be greater than 0'; END IF;
  IF coalesce(p_accepted_qty,0) < 0 OR coalesce(p_rejected_qty,0) < 0 THEN RAISE EXCEPTION 'Quantities cannot be negative'; END IF;
  IF p_result <> 'hold' AND coalesce(p_accepted_qty,0) + coalesce(p_rejected_qty,0) <> p_inspected_qty THEN
    RAISE EXCEPTION 'Accepted (%) + rejected (%) must equal inspected (%)', p_accepted_qty, p_rejected_qty, p_inspected_qty;
  END IF;
  IF p_result = 'hold' AND coalesce(p_accepted_qty,0) > 0 THEN RAISE EXCEPTION 'A HOLD result cannot accept quantity'; END IF;
  IF p_result = 'fail' AND coalesce(p_rejected_qty,0) = 0 THEN RAISE EXCEPTION 'A FAIL result needs a rejected quantity'; END IF;
  IF coalesce(p_rejected_qty,0) > 0 AND p_disposition IS NULL THEN RAISE EXCEPTION 'Choose a disposition (rework, scrap or NCR) for rejected pieces'; END IF;

  SELECT * INTO v_batch FROM production_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Production batch not found'; END IF;

  SELECT coalesce(sum(accepted_qty + rejected_qty),0) INTO v_already_inspected
  FROM final_qc_inspections WHERE batch_id = p_batch_id AND result <> 'hold';
  v_max := greatest(coalesce(v_batch.produced_qty,0), coalesce(v_batch.production_complete_qty,0)) - v_already_inspected;
  IF p_result <> 'hold' AND p_inspected_qty > v_max THEN
    RAISE EXCEPTION 'Inspected quantity (%) exceeds produced quantity not yet Final-QC inspected (%)', p_inspected_qty, greatest(v_max,0);
  END IF;

  SELECT wo_number INTO v_wo_number FROM work_orders WHERE id = v_batch.wo_id;

  IF p_disposition = 'ncr' AND coalesce(p_rejected_qty,0) > 0 THEN
    v_ncr_number := public.generate_ncr_number();
    INSERT INTO ncrs (ncr_number, ncr_type, source_reference, work_order_id, quantity_affected, unit,
                      issue_description, raised_from, created_by, status)
    VALUES (v_ncr_number, 'INTERNAL', 'Final QC batch #' || v_batch.batch_number, v_batch.wo_id, p_rejected_qty, 'pcs',
            'Final QC rejection on ' || coalesce(v_wo_number,'WO') || ' batch #' || v_batch.batch_number
              || coalesce(': ' || nullif(p_remarks,''), ''),
            'final_qc', v_uid, 'OPEN')
    RETURNING id INTO v_ncr_id;
  END IF;

  INSERT INTO final_qc_inspections (batch_id, wo_id, result, inspected_qty, accepted_qty, rejected_qty, disposition, inspector_id, remarks, ncr_id)
  VALUES (p_batch_id, v_batch.wo_id, p_result, p_inspected_qty, coalesce(p_accepted_qty,0), coalesce(p_rejected_qty,0), p_disposition, v_uid, p_remarks, v_ncr_id)
  RETURNING id INTO v_id;

  IF p_result <> 'hold' THEN
    UPDATE production_batches SET
      qc_approved_qty = coalesce(qc_approved_qty,0) + coalesce(p_accepted_qty,0),
      qc_rejected_qty = coalesce(qc_rejected_qty,0) + coalesce(p_rejected_qty,0),
      qc_final_status = CASE WHEN coalesce(qc_approved_qty,0) + coalesce(p_accepted_qty,0) > 0 THEN 'passed' ELSE 'failed' END,
      qc_final_approved_by = v_uid,
      qc_final_approved_at = now()
    WHERE id = p_batch_id;
  END IF;

  RETURN jsonb_build_object('inspection_id', v_id, 'ncr_id', v_ncr_id, 'ncr_number', v_ncr_number);
END;
$$;
REVOKE ALL ON FUNCTION public.record_final_qc(uuid,text,integer,integer,integer,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_final_qc(uuid,text,integer,integer,integer,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_final_qc_packing_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_batch production_batches%ROWTYPE;
  v_packed integer;
  v_available integer;
BEGIN
  IF NEW.production_batch_id IS NULL THEN
    RAISE EXCEPTION 'Packing requires a production batch that has passed Final QC';
  END IF;
  SELECT * INTO v_batch FROM production_batches WHERE id = NEW.production_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Production batch not found'; END IF;
  IF v_batch.wo_id <> NEW.wo_id THEN RAISE EXCEPTION 'Production batch does not belong to this work order'; END IF;
  SELECT coalesce(sum(quantity),0) INTO v_packed FROM cartons WHERE production_batch_id = NEW.production_batch_id;
  v_available := coalesce(v_batch.qc_approved_qty,0) - v_packed;
  IF NEW.quantity > v_available THEN
    RAISE EXCEPTION 'Cannot pack % pcs from batch #%: only % pcs are Final-QC approved and not yet packed (approved %, already packed %).',
      NEW.quantity, v_batch.batch_number, greatest(v_available,0), coalesce(v_batch.qc_approved_qty,0), v_packed;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_enforce_final_qc_packing_gate
BEFORE INSERT ON public.cartons
FOR EACH ROW EXECUTE FUNCTION public.enforce_final_qc_packing_gate();

UPDATE public.cartons c
SET production_batch_id = coalesce(d.production_batch_id, (SELECT pb.id FROM public.production_batches pb WHERE pb.wo_id = c.wo_id ORDER BY pb.batch_number LIMIT 1))
FROM public.dispatch_qc_batches d
WHERE c.production_batch_id IS NULL AND d.id = c.dispatch_qc_batch_id;

WITH src AS (
  SELECT d.work_order_id AS wo_id,
         coalesce(d.production_batch_id, (SELECT pb.id FROM public.production_batches pb WHERE pb.wo_id = d.work_order_id ORDER BY pb.batch_number LIMIT 1)) AS batch_id,
         d.qc_approved_quantity, coalesce(d.rejected_quantity,0) AS rej, d.approved_by, d.qc_date, d.qc_batch_id
  FROM public.dispatch_qc_batches d
  WHERE EXISTS (SELECT 1 FROM public.cartons c WHERE c.dispatch_qc_batch_id = d.id)
)
INSERT INTO public.final_qc_inspections (batch_id, wo_id, result, inspected_qty, accepted_qty, rejected_qty, disposition, inspector_id, remarks, system_backfill, created_at)
SELECT batch_id, wo_id, 'pass', qc_approved_quantity + rej, qc_approved_quantity, rej, CASE WHEN rej > 0 THEN 'scrap' END, approved_by,
       'Backfilled from historic dispatch QC ' || qc_batch_id, true, coalesce(qc_date, now())
FROM src WHERE batch_id IS NOT NULL;

UPDATE public.production_batches pb SET
  qc_approved_qty = least(s.acc, greatest(coalesce(pb.produced_qty,0), coalesce(pb.production_complete_qty,0)) - coalesce(pb.qc_rejected_qty,0)),
  qc_final_status = 'passed',
  qc_final_approved_at = coalesce(pb.qc_final_approved_at, now())
FROM (SELECT batch_id, sum(accepted_qty) acc FROM public.final_qc_inspections WHERE system_backfill GROUP BY batch_id) s
WHERE pb.id = s.batch_id AND coalesce(pb.qc_approved_qty,0) < s.acc;