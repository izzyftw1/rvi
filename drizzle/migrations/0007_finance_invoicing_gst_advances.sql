-- ===== Finance settings (singleton) =====
CREATE TABLE public.finance_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  company_state text NOT NULL DEFAULT 'Gujarat',
  default_gst_percent numeric NOT NULL DEFAULT 18,
  domestic_invoice_prefix text NOT NULL DEFAULT 'RV',
  export_invoice_prefix text NOT NULL DEFAULT 'EXPRV',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, UPDATE ON public.finance_settings TO authenticated;
GRANT ALL ON public.finance_settings TO service_role;
ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read finance settings" ON public.finance_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Finance and admin can update finance settings" ON public.finance_settings FOR UPDATE TO authenticated
  USING (public.is_finance_role(auth.uid()) OR public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_finance_role(auth.uid()) OR public.is_admin_user(auth.uid()));
INSERT INTO public.finance_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- ===== GST % and advance fields on SOs =====
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS gst_percent numeric;
ALTER TABLE public.sales_order_line_items ADD COLUMN IF NOT EXISTS gst_percent numeric;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS advance_percent numeric;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS advance_due_amount numeric;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS advance_applied numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.sync_so_advance_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.advance_payment IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.advance_payment IS DISTINCT FROM OLD.advance_payment) THEN
    NEW.advance_percent := CASE WHEN NEW.advance_payment->>'type' IN ('percent','percentage') THEN nullif(NEW.advance_payment->>'value','')::numeric END;
    NEW.advance_due_amount := coalesce(nullif(NEW.advance_payment->>'calculated_amount','')::numeric,
      CASE WHEN NEW.advance_percent IS NOT NULL THEN round(coalesce(NEW.total_amount,0) * NEW.advance_percent / 100, 2) END);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_sync_so_advance_fields BEFORE INSERT OR UPDATE ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.sync_so_advance_fields();

UPDATE public.sales_orders SET
  advance_percent = CASE WHEN advance_payment->>'type' IN ('percent','percentage') THEN nullif(advance_payment->>'value','')::numeric END,
  advance_due_amount = nullif(advance_payment->>'calculated_amount','')::numeric
WHERE advance_payment IS NOT NULL;

-- ===== Advance receipts on existing customer_receipts =====
ALTER TABLE public.customer_receipts ADD COLUMN IF NOT EXISTS sales_order_id uuid REFERENCES public.sales_orders(id);
ALTER TABLE public.customer_receipts ADD COLUMN IF NOT EXISTS receipt_type text NOT NULL DEFAULT 'payment' CHECK (receipt_type IN ('payment','advance'));
CREATE INDEX IF NOT EXISTS idx_customer_receipts_so ON public.customer_receipts(sales_order_id) WHERE sales_order_id IS NOT NULL;

CREATE OR REPLACE VIEW public.so_advance_status WITH (security_invoker = true) AS
SELECT so.id AS sales_order_id, so.so_id, so.customer_id, so.currency,
  so.advance_percent, coalesce(so.advance_due_amount,0) AS advance_due,
  coalesce(r.received,0) AS advance_received,
  coalesce(r.applied,0) AS advance_applied,
  greatest(0, coalesce(r.received,0) - coalesce(r.applied,0)) AS advance_unapplied,
  greatest(0, coalesce(so.advance_due_amount,0) - coalesce(r.received,0)) AS advance_outstanding
FROM public.sales_orders so
LEFT JOIN (
  SELECT sales_order_id, sum(total_amount) AS received, sum(coalesce(allocated_amount,0)) AS applied
  FROM public.customer_receipts WHERE receipt_type = 'advance' AND coalesce(status,'') <> 'cancelled'
  GROUP BY sales_order_id
) r ON r.sales_order_id = so.id;
GRANT SELECT ON public.so_advance_status TO authenticated;

CREATE OR REPLACE FUNCTION public.record_advance_receipt(
  p_so_id uuid, p_date date, p_amount numeric, p_currency text, p_reference text,
  p_method public.payment_method DEFAULT 'bank_transfer'
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_so record; v_no text; v_id uuid;
BEGIN
  IF NOT (public.is_finance_role(auth.uid()) OR public.is_admin_user(auth.uid())) THEN
    RAISE EXCEPTION 'Only Finance can log advance receipts';
  END IF;
  IF coalesce(p_amount,0) <= 0 THEN RAISE EXCEPTION 'Advance amount must be greater than 0'; END IF;
  SELECT id, customer_id, currency, so_id INTO v_so FROM sales_orders WHERE id = p_so_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales order not found'; END IF;
  IF v_so.customer_id IS NULL THEN RAISE EXCEPTION 'Sales order % has no customer', v_so.so_id; END IF;
  v_no := public.next_document_number('advance_receipt', 'ADV');
  INSERT INTO customer_receipts (receipt_no, customer_id, receipt_date, total_amount, allocated_amount, unallocated_amount,
    payment_method, bank_reference, currency, notes, status, created_by, sales_order_id, receipt_type)
  VALUES (v_no, v_so.customer_id, coalesce(p_date, current_date), p_amount, 0, p_amount,
    p_method, p_reference, coalesce(p_currency, v_so.currency, 'INR'), 'Advance against ' || v_so.so_id, 'pending', auth.uid(), p_so_id, 'advance')
  RETURNING id INTO v_id;
  UPDATE sales_orders SET advance_payment_received = true WHERE id = p_so_id;
  RETURN jsonb_build_object('receipt_id', v_id, 'receipt_no', v_no);
END; $$;
REVOKE ALL ON FUNCTION public.record_advance_receipt(uuid,date,numeric,text,text,public.payment_method) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_advance_receipt(uuid,date,numeric,text,text,public.payment_method) TO authenticated;

-- ===== Allocation: balance never below 0, excess stays unallocated on the receipt =====
CREATE OR REPLACE FUNCTION public.handle_receipt_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Invoice and receipt totals are recomputed by update_invoice_from_allocation / update_receipt_status.
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.update_invoice_from_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inv uuid := COALESCE(NEW.invoice_id, OLD.invoice_id); v_alloc numeric; v_total numeric; v_adj numeric; v_paid numeric;
BEGIN
  SELECT COALESCE(SUM(allocated_amount),0) INTO v_alloc FROM receipt_allocations WHERE invoice_id = v_inv;
  SELECT total_amount, COALESCE(internal_adjustment_total,0) INTO v_total, v_adj FROM invoices WHERE id = v_inv;
  v_paid := v_alloc + v_adj;
  UPDATE invoices SET
    paid_amount = v_paid,
    balance_amount = GREATEST(0, COALESCE(v_total,0) - v_paid),
    status = CASE WHEN v_paid <= 0 THEN 'issued'::invoice_status
                  WHEN v_paid < COALESCE(v_total,0) THEN 'part_paid'::invoice_status
                  ELSE 'paid'::invoice_status END,
    updated_at = now()
  WHERE id = v_inv;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.update_receipt_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := COALESCE(NEW.receipt_id, OLD.receipt_id); v_total numeric; v_alloc numeric;
BEGIN
  SELECT total_amount INTO v_total FROM customer_receipts WHERE id = v_id;
  SELECT COALESCE(SUM(allocated_amount),0) INTO v_alloc FROM receipt_allocations WHERE receipt_id = v_id;
  UPDATE customer_receipts SET
    allocated_amount = v_alloc,
    unallocated_amount = GREATEST(0, v_total - v_alloc),
    status = CASE WHEN v_alloc = 0 THEN 'pending' WHEN v_alloc < v_total THEN 'partially_allocated' ELSE 'fully_allocated' END,
    updated_at = now()
  WHERE id = v_id;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.validate_allocation_amount()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv_balance numeric; receipt_unalloc numeric;
BEGIN
  IF NEW.allocated_amount IS NULL OR NEW.allocated_amount <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be greater than 0';
  END IF;
  SELECT balance_amount INTO inv_balance FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF NEW.allocated_amount > GREATEST(0, COALESCE(inv_balance,0)) THEN
    RAISE EXCEPTION 'Allocation (%) exceeds invoice balance (%). Leave the excess as unallocated customer credit.', NEW.allocated_amount, GREATEST(0, COALESCE(inv_balance,0));
  END IF;
  SELECT total_amount - COALESCE((SELECT SUM(allocated_amount) FROM receipt_allocations WHERE receipt_id = NEW.receipt_id),0)
  INTO receipt_unalloc FROM customer_receipts WHERE id = NEW.receipt_id FOR UPDATE;
  IF receipt_unalloc IS NOT NULL AND NEW.allocated_amount > receipt_unalloc THEN
    RAISE EXCEPTION 'Allocation (%) exceeds receipt unallocated amount (%)', NEW.allocated_amount, receipt_unalloc;
  END IF;
  RETURN NEW;
END; $$;

-- ===== Invoice numbering: two series per financial year =====
CREATE OR REPLACE FUNCTION public.next_invoice_number(p_export boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fy text := public.get_financial_year(current_date); v_short text; v_no integer; v_prefix text; v_candidate text;
BEGIN
  v_short := substr(v_fy,3,2) || '-' || substr(v_fy,8,2);
  SELECT CASE WHEN p_export THEN export_invoice_prefix ELSE domestic_invoice_prefix END INTO v_prefix FROM finance_settings WHERE id;
  v_prefix := coalesce(v_prefix, CASE WHEN p_export THEN 'EXPRV' ELSE 'RV' END);
  LOOP
    INSERT INTO document_sequences (doc_type, financial_year, last_no)
    VALUES (CASE WHEN p_export THEN 'invoice_export' ELSE 'invoice_domestic' END, v_fy, 1)
    ON CONFLICT (doc_type, financial_year) DO UPDATE SET last_no = document_sequences.last_no + 1
    RETURNING last_no INTO v_no;
    v_candidate := CASE WHEN p_export THEN v_prefix || lpad(v_no::text,3,'0') || '/' || v_short
                        ELSE v_prefix || '/' || v_short || '/' || lpad(v_no::text,4,'0') END;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM invoices WHERE invoice_no = v_candidate);
  END LOOP;
  RETURN v_candidate;
END; $$;
REVOKE ALL ON FUNCTION public.next_invoice_number(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(boolean) TO authenticated;

-- ===== Atomic invoice creation from a shipment's dispatch notes =====
-- p_qty_overrides: {"<dispatch_note_id>": qty}; p_advances: {"<sales_order_id>": amount}
CREATE OR REPLACE FUNCTION public.create_invoice_from_shipment(
  p_shipment_id uuid, p_qty_overrides jsonb DEFAULT '{}'::jsonb, p_advances jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ship record; v_cust record; v_set record; v_n record; v_adj record; v_adv record;
  v_customers integer; v_customer_id uuid; v_currencies integer; v_currency text;
  v_sos integer; v_so_id uuid; v_so record;
  v_is_export boolean; v_gst_type text; v_inv_id uuid; v_inv_no text;
  v_qty numeric; v_gst numeric; v_amount numeric; v_line_gst numeric;
  v_total numeric; v_gst_total numeric; v_adj_total numeric := 0; v_adj_notes text := '';
  v_remaining numeric; v_apply numeric; v_adv_total numeric := 0; v_req numeric; v_key text;
  v_missing text; v_terms integer; v_gst_pct numeric; v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_ship FROM shipments WHERE id = p_shipment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found'; END IF;

  PERFORM 1 FROM dispatch_notes WHERE shipment_id = p_shipment_id AND NOT coalesce(invoiced,false) FOR UPDATE;
  SELECT count(*) INTO v_count FROM dispatch_notes WHERE shipment_id = p_shipment_id AND NOT coalesce(invoiced,false);
  IF v_count = 0 THEN RAISE EXCEPTION 'Shipment % has nothing left to invoice', v_ship.ship_id; END IF;

  IF p_qty_overrides IS NOT NULL AND p_qty_overrides <> '{}'::jsonb AND NOT public.can_perform_action(v_uid, 'create_invoice') THEN
    RAISE EXCEPTION 'Only Finance can override invoice quantities';
  END IF;

  -- Customer from each note's own SO (fallback: WO customer_id)
  SELECT count(DISTINCT coalesce(so.customer_id, wo.customer_id)), min(coalesce(so.customer_id, wo.customer_id)::text)::uuid,
         count(*) FILTER (WHERE coalesce(so.customer_id, wo.customer_id) IS NULL),
         count(DISTINCT coalesce(dn.sales_order_id, wo.so_id)), min(coalesce(dn.sales_order_id, wo.so_id)::text)::uuid
  INTO v_customers, v_customer_id, v_count, v_sos, v_so_id
  FROM dispatch_notes dn JOIN work_orders wo ON wo.id = dn.work_order_id
  LEFT JOIN sales_orders so ON so.id = coalesce(dn.sales_order_id, wo.so_id)
  WHERE dn.shipment_id = p_shipment_id AND NOT coalesce(dn.invoiced,false);
  IF v_count > 0 OR v_customer_id IS NULL THEN RAISE EXCEPTION 'Missing customer on shipment %: link its work orders to a sales order with a customer', v_ship.ship_id; END IF;
  IF v_customers > 1 THEN RAISE EXCEPTION 'Shipment % spans % customers; invoice them separately', v_ship.ship_id, v_customers; END IF;

  SELECT * INTO v_cust FROM customer_master WHERE id = v_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing customer on shipment %', v_ship.ship_id; END IF;

  SELECT string_agg(DISTINCT coalesce(wo.wo_number, dn.item_code), ', ') INTO v_missing
  FROM dispatch_notes dn LEFT JOIN work_orders wo ON wo.id = dn.work_order_id
  WHERE dn.shipment_id = p_shipment_id AND NOT coalesce(dn.invoiced,false) AND coalesce(dn.unit_rate,0) <= 0;
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'Missing price on %', v_missing; END IF;

  SELECT count(DISTINCT coalesce(dn.currency, so.currency, 'INR')), min(coalesce(dn.currency, so.currency, 'INR'))
  INTO v_currencies, v_currency
  FROM dispatch_notes dn JOIN work_orders wo ON wo.id = dn.work_order_id
  LEFT JOIN sales_orders so ON so.id = coalesce(dn.sales_order_id, wo.so_id)
  WHERE dn.shipment_id = p_shipment_id AND NOT coalesce(dn.invoiced,false);
  IF v_currencies > 1 THEN RAISE EXCEPTION 'Shipment % mixes currencies; invoice them separately', v_ship.ship_id; END IF;

  SELECT * INTO v_set FROM finance_settings WHERE id;
  v_is_export := coalesce(v_cust.is_export_customer,false)
                 OR (nullif(trim(v_cust.country),'') IS NOT NULL AND lower(trim(v_cust.country)) <> 'india');
  v_gst_type := CASE WHEN v_is_export THEN 'export'
                     WHEN lower(trim(coalesce(v_cust.state,''))) = lower(trim(coalesce(v_set.company_state,'Gujarat'))) THEN 'cgst_sgst'
                     ELSE 'igst' END;

  IF v_sos = 1 THEN SELECT * INTO v_so FROM sales_orders WHERE id = v_so_id; END IF;
  v_terms := coalesce(v_cust.payment_terms_days, v_so.payment_terms_days, 30);
  v_inv_no := public.next_invoice_number(v_is_export);

  INSERT INTO invoices (invoice_no, shipment_id, so_id, customer_id, invoice_date, due_date, dispatch_date, status, currency,
    payment_terms_days, created_by, is_locked, gst_type, gst_percent, is_export, customer_address, customer_contact, customer_email,
    customer_gst, incoterm, po_number, po_date, country_of_origin, total_gross_weight, total_net_weight)
  VALUES (v_inv_no, p_shipment_id, CASE WHEN v_sos = 1 THEN v_so_id END, v_customer_id, current_date,
    (coalesce(v_ship.ship_date, now())::date + v_terms), coalesce(v_ship.ship_date, now())::date, 'issued', v_currency,
    v_terms, v_uid, true, v_gst_type, 0, v_is_export,
    concat_ws(', ', v_cust.address_line_1, v_cust.city, v_cust.state, v_cust.pincode, v_cust.country),
    v_cust.primary_contact_name, v_cust.primary_contact_email, v_cust.gst_number,
    CASE WHEN v_is_export THEN v_so.incoterm END, v_so.po_number, v_so.po_date, 'India',
    (SELECT sum(gross_weight_kg) FROM dispatch_notes WHERE shipment_id = p_shipment_id AND NOT coalesce(invoiced,false)),
    (SELECT sum(net_weight_kg) FROM dispatch_notes WHERE shipment_id = p_shipment_id AND NOT coalesce(invoiced,false)))
  RETURNING id INTO v_inv_id;

  FOR v_n IN
    SELECT dn.*, sli.gst_percent AS line_gst, so.gst_percent AS so_gst
    FROM dispatch_notes dn JOIN work_orders wo ON wo.id = dn.work_order_id
    LEFT JOIN sales_order_line_items sli ON sli.id = wo.sales_order_line_id
    LEFT JOIN sales_orders so ON so.id = coalesce(dn.sales_order_id, wo.so_id)
    WHERE dn.shipment_id = p_shipment_id AND NOT coalesce(dn.invoiced,false)
  LOOP
    v_qty := coalesce(nullif(p_qty_overrides->>(v_n.id::text),'')::numeric, v_n.dispatched_qty);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Invoice quantity for % must be greater than 0', v_n.dispatch_note_no; END IF;
    v_gst := CASE WHEN v_is_export THEN 0 ELSE coalesce(v_n.line_gst, v_n.so_gst, v_set.default_gst_percent, 18) END;
    v_gst_pct := greatest(coalesce(v_gst_pct,0), v_gst);
    v_amount := round(v_qty * v_n.unit_rate, 2);
    v_line_gst := round(v_amount * v_gst / 100, 2);
    INSERT INTO invoice_items (invoice_id, dispatch_id, dispatch_note_id, wo_id, item_code, description, quantity, so_ordered_qty,
      rate, amount, gst_percent, gst_amount, total_line, qty_override_by, qty_override_at)
    VALUES (v_inv_id, v_n.dispatch_id, v_n.id, v_n.work_order_id, v_n.item_code, coalesce(v_n.item_description, v_n.item_code),
      v_qty, v_n.so_ordered_qty, v_n.unit_rate, v_amount, v_gst, v_line_gst, v_amount + v_line_gst,
      CASE WHEN p_qty_overrides ? (v_n.id::text) THEN v_uid END, CASE WHEN p_qty_overrides ? (v_n.id::text) THEN now() END);
  END LOOP;

  UPDATE dispatch_notes SET invoiced = true, invoice_id = v_inv_id
  WHERE shipment_id = p_shipment_id AND NOT coalesce(invoiced,false);

  SELECT total_amount, gst_amount INTO v_total, v_gst_total FROM invoices WHERE id = v_inv_id;
  UPDATE invoices SET
    gst_percent = coalesce(v_gst_pct,0),
    gross_amount = v_total,
    cgst_amount = CASE WHEN v_gst_type = 'cgst_sgst' THEN round(v_gst_total/2,2) ELSE 0 END,
    sgst_amount = CASE WHEN v_gst_type = 'cgst_sgst' THEN v_gst_total - round(v_gst_total/2,2) ELSE 0 END,
    igst_amount = CASE WHEN v_gst_type = 'igst' THEN v_gst_total ELSE 0 END
  WHERE id = v_inv_id;

  -- Internal customer credit adjustments (same currency, oldest first)
  v_remaining := v_total;
  FOR v_adj IN SELECT * FROM customer_credit_adjustments
    WHERE customer_id = v_customer_id AND status = 'pending' AND remaining_amount > 0 AND coalesce(currency, v_currency) = v_currency
    ORDER BY created_at FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := least(v_adj.remaining_amount, v_remaining);
    v_adj_total := v_adj_total + v_apply; v_remaining := v_remaining - v_apply;
    v_adj_notes := v_adj_notes || coalesce(v_adj.adjustment_type,'adjustment') || ': ' || v_currency || ' ' || v_apply || ' (' || v_adj.reason || '); ';
    UPDATE customer_credit_adjustments SET
      remaining_amount = remaining_amount - v_apply,
      status = CASE WHEN remaining_amount - v_apply <= 0 THEN 'applied' ELSE status END,
      applied_to_invoice_id = v_inv_id, applied_at = now()
    WHERE id = v_adj.id;
  END LOOP;
  IF v_adj_total > 0 THEN
    UPDATE invoices SET internal_adjustment_total = v_adj_total, internal_adjustment_notes = v_adj_notes,
      paid_amount = v_adj_total, balance_amount = greatest(0, v_total - v_adj_total),
      status = CASE WHEN v_total - v_adj_total <= 0 THEN 'paid'::invoice_status ELSE 'part_paid'::invoice_status END
    WHERE id = v_inv_id;
  END IF;

  -- "Less advance": apply advance actually received for each SO, up to unapplied and invoice balance
  FOR v_key IN SELECT jsonb_object_keys(coalesce(p_advances,'{}'::jsonb)) LOOP
    v_req := nullif(p_advances->>v_key,'')::numeric;
    CONTINUE WHEN coalesce(v_req,0) <= 0;
    IF NOT EXISTS (SELECT 1 FROM dispatch_notes dn JOIN work_orders wo ON wo.id = dn.work_order_id
                   WHERE dn.invoice_id = v_inv_id AND coalesce(dn.sales_order_id, wo.so_id) = v_key::uuid) THEN
      RAISE EXCEPTION 'Advance can only be deducted for a sales order on this invoice';
    END IF;
    FOR v_adv IN SELECT * FROM customer_receipts
      WHERE sales_order_id = v_key::uuid AND receipt_type = 'advance' AND coalesce(currency, v_currency) = v_currency
      ORDER BY receipt_date, created_at FOR UPDATE
    LOOP
      EXIT WHEN v_req <= 0;
      SELECT balance_amount INTO v_remaining FROM invoices WHERE id = v_inv_id;
      v_apply := least(v_req, v_adv.total_amount - coalesce((SELECT sum(allocated_amount) FROM receipt_allocations WHERE receipt_id = v_adv.id),0), v_remaining);
      CONTINUE WHEN v_apply <= 0;
      INSERT INTO receipt_allocations (receipt_id, invoice_id, allocated_amount, allocated_by, notes, gross_amount, net_amount, tds_amount)
      VALUES (v_adv.id, v_inv_id, v_apply, v_uid, 'Less advance ' || v_adv.receipt_no, v_apply, v_apply, 0);
      v_adv_total := v_adv_total + v_apply; v_req := v_req - v_apply;
    END LOOP;
  END LOOP;
  IF v_adv_total > 0 THEN UPDATE invoices SET advance_applied = v_adv_total WHERE id = v_inv_id; END IF;

  RETURN jsonb_build_object('invoice_id', v_inv_id, 'invoice_no', v_inv_no, 'total', v_total, 'currency', v_currency,
    'gst_type', v_gst_type, 'adjustment_applied', v_adj_total, 'advance_applied', v_adv_total);
END; $$;
REVOKE ALL ON FUNCTION public.create_invoice_from_shipment(uuid,jsonb,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_from_shipment(uuid,jsonb,jsonb) TO authenticated;