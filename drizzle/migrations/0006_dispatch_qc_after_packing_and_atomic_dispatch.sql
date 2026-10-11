-- ===== Document numbering per financial year (Apr–Mar) =====
CREATE TABLE public.document_sequences (
  doc_type text NOT NULL,
  financial_year text NOT NULL,
  last_no integer NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_type, financial_year)
);
GRANT ALL ON public.document_sequences TO service_role;
ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_document_number(p_doc_type text, p_prefix text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fy text := public.get_financial_year(current_date); v_no integer;
BEGIN
  INSERT INTO document_sequences (doc_type, financial_year, last_no) VALUES (p_doc_type, v_fy, 1)
  ON CONFLICT (doc_type, financial_year) DO UPDATE SET last_no = document_sequences.last_no + 1
  RETURNING last_no INTO v_no;
  RETURN p_prefix || '/' || substr(v_fy,3,2) || '-' || substr(v_fy,8,2) || '/' || lpad(v_no::text, 4, '0');
END; $$;
REVOKE ALL ON FUNCTION public.next_document_number(text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.next_document_number(text,text) TO authenticated;

-- ===== Dispatch QC on packed cartons =====
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customer_master(id);
ALTER TABLE public.cartons ADD COLUMN IF NOT EXISTS dispatch_qc_status text NOT NULL DEFAULT 'pending'
  CHECK (dispatch_qc_status IN ('pending','passed','failed'));
ALTER TABLE public.cartons ADD COLUMN IF NOT EXISTS dispatch_qc_inspection_id uuid;

CREATE TABLE public.dispatch_qc_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_no text NOT NULL UNIQUE,
  customer_id uuid,
  customer_name text,
  carton_ids uuid[] NOT NULL,
  total_qty integer NOT NULL DEFAULT 0,
  result text NOT NULL CHECK (result IN ('pass','fail')),
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  remarks text,
  inspector_id uuid,
  system_backfill boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dispatch_qc_inspections TO authenticated;
GRANT ALL ON public.dispatch_qc_inspections TO service_role;
ALTER TABLE public.dispatch_qc_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "QC, packing and admin can view dispatch QC" ON public.dispatch_qc_inspections
FOR SELECT TO authenticated
USING (public.has_any_department_type(auth.uid(), ARRAY['quality','packing','production','admin','super_admin','finance']) OR public.is_admin_user(auth.uid()));

ALTER TABLE public.cartons ADD CONSTRAINT cartons_dispatch_qc_inspection_fk
  FOREIGN KEY (dispatch_qc_inspection_id) REFERENCES public.dispatch_qc_inspections(id);

CREATE OR REPLACE FUNCTION public.record_dispatch_qc(
  p_carton_ids uuid[], p_result text, p_checklist jsonb, p_remarks text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_customers integer;
  v_customer_id uuid;
  v_customer_name text;
  v_qty integer;
  v_id uuid;
  v_no text;
  v_count integer;
  v_open_ncr text;
  v_key text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_any_department_type(v_uid, ARRAY['quality','admin','super_admin']) OR public.is_admin_user(v_uid)) THEN
    RAISE EXCEPTION 'Only Quality or Admin can record Dispatch QC';
  END IF;
  IF p_result NOT IN ('pass','fail') THEN RAISE EXCEPTION 'Result must be pass or fail'; END IF;
  IF p_carton_ids IS NULL OR array_length(p_carton_ids,1) IS NULL THEN RAISE EXCEPTION 'Select at least one carton'; END IF;
  IF p_result = 'fail' AND coalesce(trim(p_remarks),'') = '' THEN RAISE EXCEPTION 'Remarks are required for a failed Dispatch QC'; END IF;

  PERFORM 1 FROM cartons WHERE id = ANY(p_carton_ids) FOR UPDATE;
  SELECT count(*) INTO v_count FROM cartons WHERE id = ANY(p_carton_ids) AND status = 'ready_for_dispatch' AND dispatch_qc_status <> 'passed';
  IF v_count <> array_length(p_carton_ids,1) THEN
    RAISE EXCEPTION 'Some selected cartons are not packed and awaiting Dispatch QC';
  END IF;

  SELECT count(DISTINCT coalesce(so.customer_id::text, wo.customer_id::text, wo.customer)),
         min(coalesce(so.customer_id, wo.customer_id)::text)::uuid,
         min(coalesce(cm.customer_name, wo.customer)),
         sum(c.quantity - coalesce(c.dispatched_qty,0))
  INTO v_customers, v_customer_id, v_customer_name, v_qty
  FROM cartons c JOIN work_orders wo ON wo.id = c.wo_id
  LEFT JOIN sales_orders so ON so.id = wo.so_id
  LEFT JOIN customer_master cm ON cm.id = coalesce(so.customer_id, wo.customer_id)
  WHERE c.id = ANY(p_carton_ids);
  IF v_customers > 1 THEN RAISE EXCEPTION 'Dispatch QC covers one customer at a time; the selected cartons belong to % customers', v_customers; END IF;

  IF p_result = 'pass' THEN
    FOREACH v_key IN ARRAY ARRAY['customer','part_revision','quantity','wo_batch','labels','packaging','documents','no_holds_ncrs'] LOOP
      IF coalesce((p_checklist->>v_key)::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Dispatch QC pass requires every check to be confirmed (missing: %)', v_key;
      END IF;
    END LOOP;
    SELECT string_agg(DISTINCT n.ncr_number, ', ') INTO v_open_ncr
    FROM ncrs n JOIN cartons c ON c.wo_id = n.work_order_id
    WHERE c.id = ANY(p_carton_ids) AND n.status <> 'CLOSED';
    IF v_open_ncr IS NOT NULL THEN RAISE EXCEPTION 'Cannot pass Dispatch QC: open NCRs on these work orders (%)', v_open_ncr; END IF;
    IF EXISTS (SELECT 1 FROM cartons c JOIN production_batches pb ON pb.id = c.production_batch_id
               WHERE c.id = ANY(p_carton_ids) AND pb.qc_final_status NOT IN ('passed','waived')) THEN
      RAISE EXCEPTION 'Cannot pass Dispatch QC: a carton''s production batch is on hold or has not passed Final QC';
    END IF;
  END IF;

  v_no := public.next_document_number('dispatch_qc', 'DQC');
  INSERT INTO dispatch_qc_inspections (inspection_no, customer_id, customer_name, carton_ids, total_qty, result, checklist, remarks, inspector_id)
  VALUES (v_no, v_customer_id, v_customer_name, p_carton_ids, coalesce(v_qty,0), p_result, coalesce(p_checklist,'{}'::jsonb), p_remarks, v_uid)
  RETURNING id INTO v_id;

  UPDATE cartons SET dispatch_qc_status = CASE WHEN p_result = 'pass' THEN 'passed' ELSE 'failed' END,
                     dispatch_qc_inspection_id = v_id
  WHERE id = ANY(p_carton_ids);

  RETURN jsonb_build_object('inspection_id', v_id, 'inspection_no', v_no);
END; $$;
REVOKE ALL ON FUNCTION public.record_dispatch_qc(uuid[],text,jsonb,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_dispatch_qc(uuid[],text,jsonb,text) TO authenticated;

-- ===== Dispatch gate: only cartons with passed Dispatch QC =====
CREATE OR REPLACE FUNCTION public.validate_and_update_dispatch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch_record record;
  v_carton record;
  v_already integer;
BEGIN
  IF NEW.quantity <= 0 THEN RAISE EXCEPTION 'Dispatch quantity must be greater than 0'; END IF;

  SELECT * INTO v_batch_record FROM public.production_batches WHERE id = NEW.batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid batch_id: Batch not found'; END IF;
  IF v_batch_record.wo_id != NEW.wo_id THEN RAISE EXCEPTION 'Batch does not belong to this work order'; END IF;

  IF NEW.carton_id IS NULL THEN
    RAISE EXCEPTION 'Cannot dispatch without a carton: only packed cartons with a passed Dispatch QC can be dispatched';
  END IF;

  SELECT id, wo_id, carton_id, quantity, dispatch_qc_status INTO v_carton
  FROM public.cartons WHERE id = NEW.carton_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid carton_id: Carton not found'; END IF;
  IF v_carton.wo_id IS DISTINCT FROM NEW.wo_id THEN RAISE EXCEPTION 'Carton does not belong to this work order'; END IF;
  IF v_carton.dispatch_qc_status IS DISTINCT FROM 'passed' THEN
    RAISE EXCEPTION 'Cannot dispatch carton %: Dispatch QC has not passed (status: %)', v_carton.carton_id, coalesce(v_carton.dispatch_qc_status,'pending');
  END IF;

  SELECT coalesce(sum(quantity),0) INTO v_already FROM public.dispatches WHERE carton_id = NEW.carton_id;
  IF NEW.quantity > v_carton.quantity - v_already THEN
    RAISE EXCEPTION 'Cannot dispatch % pcs from carton %. Only % pcs available', NEW.quantity, v_carton.carton_id, v_carton.quantity - v_already;
  END IF;

  UPDATE public.production_batches SET dispatched_qty = coalesce(dispatched_qty,0) + NEW.quantity WHERE id = NEW.batch_id;
  RETURN NEW;
END; $$;

-- ===== Atomic shipment creation =====
CREATE OR REPLACE FUNCTION public.create_dispatch_shipment(p_items jsonb, p_remarks text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_c record;
  v_qty integer;
  v_customers integer;
  v_customer_id uuid;
  v_customer_name text;
  v_sos integer;
  v_so_id uuid;
  v_ship_id uuid;
  v_ship_no text;
  v_dispatch_id uuid;
  v_dn_no text;
  v_rate numeric;
  v_currency text;
  v_notes text[] := '{}';
  v_carton_ids uuid[];
  v_warnings jsonb := '[]'::jsonb;
  v_w record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Select at least one carton to dispatch'; END IF;

  SELECT array_agg((e->>'carton_id')::uuid) INTO v_carton_ids FROM jsonb_array_elements(p_items) e;

  SELECT count(DISTINCT coalesce(so.customer_id::text, wo.customer_id::text, wo.customer)),
         min(coalesce(so.customer_id, wo.customer_id)::text)::uuid,
         min(coalesce(cm.customer_name, so.customer, wo.customer)),
         count(DISTINCT wo.so_id), min(wo.so_id::text)::uuid
  INTO v_customers, v_customer_id, v_customer_name, v_sos, v_so_id
  FROM cartons c JOIN work_orders wo ON wo.id = c.wo_id
  LEFT JOIN sales_orders so ON so.id = wo.so_id
  LEFT JOIN customer_master cm ON cm.id = coalesce(so.customer_id, wo.customer_id)
  WHERE c.id = ANY(v_carton_ids);
  IF v_customers > 1 THEN RAISE EXCEPTION 'One shipment can only carry one customer; the selected cartons belong to % customers', v_customers; END IF;

  v_ship_no := public.next_document_number('shipment', 'SHP');
  INSERT INTO shipments (ship_id, customer, customer_id, so_id, status, ship_date, shipped_at)
  VALUES (v_ship_no, coalesce(v_customer_name,'Unknown'), v_customer_id, CASE WHEN v_sos = 1 THEN v_so_id END, 'dispatched', now(), now())
  RETURNING id INTO v_ship_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::integer;
    SELECT c.id, c.carton_id, c.wo_id, c.production_batch_id, c.quantity, c.net_weight, c.gross_weight,
           wo.item_code, wo.so_id, wo.quantity AS wo_qty, wo.customer, wo.gross_weight_per_pc, wo.net_weight_per_pc,
           wo.financial_snapshot, sli.price_per_pc AS line_price, sli.currency AS line_currency, sli.quantity AS line_qty,
           so.currency AS so_currency
    INTO v_c
    FROM cartons c JOIN work_orders wo ON wo.id = c.wo_id
    LEFT JOIN sales_order_line_items sli ON sli.id = wo.sales_order_line_id OR (wo.sales_order_line_id IS NULL AND sli.work_order_id = wo.id)
    LEFT JOIN sales_orders so ON so.id = wo.so_id
    WHERE c.id = (v_item->>'carton_id')::uuid
    LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Carton not found'; END IF;
    IF v_c.production_batch_id IS NULL THEN RAISE EXCEPTION 'Carton % has no production batch', v_c.carton_id; END IF;

    INSERT INTO dispatches (wo_id, batch_id, carton_id, quantity, shipment_id, dispatched_by, remarks)
    VALUES (v_c.wo_id, v_c.production_batch_id, v_c.id, v_qty, v_ship_id, v_uid, p_remarks)
    RETURNING id INTO v_dispatch_id;

    v_rate := coalesce(nullif(v_c.financial_snapshot->'line_item'->>'price_per_pc','')::numeric, v_c.line_price);
    v_currency := coalesce(nullif(v_c.financial_snapshot->'line_item'->>'currency',''), v_c.line_currency, v_c.so_currency, nullif(v_c.financial_snapshot->>'currency',''), 'INR');

    v_dn_no := public.next_document_number('dispatch_note', 'DN');
    INSERT INTO dispatch_notes (dispatch_note_no, work_order_id, sales_order_id, carton_id, shipment_id, dispatch_id,
      item_code, item_description, so_ordered_qty, packed_qty, dispatched_qty, rejected_qty, dispatch_date,
      unit_rate, currency, gross_weight_kg, net_weight_kg, created_by, remarks)
    VALUES (v_dn_no, v_c.wo_id, v_c.so_id, v_c.id, v_ship_id, v_dispatch_id,
      coalesce(v_c.item_code,'N/A'), coalesce(v_c.item_code,'') || ' - ' || coalesce(v_customer_name, v_c.customer, ''),
      coalesce(v_c.line_qty, v_c.wo_qty), v_qty, v_qty, 0, now(),
      v_rate, v_currency,
      CASE WHEN coalesce(v_c.gross_weight,0) > 0 AND v_c.quantity > 0 THEN round(v_c.gross_weight * v_qty / v_c.quantity, 3)
           WHEN v_c.gross_weight_per_pc IS NOT NULL THEN round(v_qty * v_c.gross_weight_per_pc / 1000, 3) END,
      CASE WHEN coalesce(v_c.net_weight,0) > 0 AND v_c.quantity > 0 THEN round(v_c.net_weight * v_qty / v_c.quantity, 3)
           WHEN v_c.net_weight_per_pc IS NOT NULL THEN round(v_qty * v_c.net_weight_per_pc / 1000, 3) END,
      v_uid, CASE WHEN v_qty < v_c.quantity THEN 'Partial dispatch: ' || v_qty || '/' || v_c.quantity END);
    v_notes := v_notes || v_dn_no;
  END LOOP;

  -- Over-shipment warnings vs SO order qty (warning only)
  FOR v_w IN
    SELECT wo.wo_number, coalesce(sli.quantity, wo.quantity) AS ordered, (SELECT coalesce(sum(d.quantity),0) FROM dispatches d WHERE d.wo_id = wo.id) AS shipped
    FROM work_orders wo LEFT JOIN sales_order_line_items sli ON sli.id = wo.sales_order_line_id
    WHERE wo.id IN (SELECT wo_id FROM cartons WHERE id = ANY(v_carton_ids))
  LOOP
    IF v_w.ordered > 0 AND v_w.shipped > v_w.ordered THEN
      v_warnings := v_warnings || jsonb_build_object('wo_number', v_w.wo_number, 'ordered', v_w.ordered, 'shipped', v_w.shipped,
        'over_pct', round((v_w.shipped - v_w.ordered) * 100.0 / v_w.ordered, 1));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('shipment_id', v_ship_id, 'ship_id', v_ship_no, 'dispatch_notes', to_jsonb(v_notes),
    'customer', v_customer_name, 'customer_id', v_customer_id, 'warnings', v_warnings);
END; $$;
REVOKE ALL ON FUNCTION public.create_dispatch_shipment(jsonb,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_dispatch_shipment(jsonb,text) TO authenticated;

-- ===== Backfill: already-dispatched cartons are Dispatch-QC passed =====
INSERT INTO public.dispatch_qc_inspections (inspection_no, carton_ids, total_qty, result, remarks, system_backfill)
SELECT 'DQC-BACKFILL', array_agg(id), coalesce(sum(quantity),0), 'pass', 'Backfill: cartons dispatched before post-packing Dispatch QC', true
FROM public.cartons WHERE status = 'dispatched' OR coalesce(dispatched_qty,0) > 0
HAVING count(*) > 0;

UPDATE public.cartons SET dispatch_qc_status = 'passed',
  dispatch_qc_inspection_id = (SELECT id FROM public.dispatch_qc_inspections WHERE inspection_no = 'DQC-BACKFILL')
WHERE status = 'dispatched' OR coalesce(dispatched_qty,0) > 0;