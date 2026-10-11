-- Shipping details captured once at Create Shipment, saved on the shipment, and copied to the invoice.
-- Idempotent: safe to re-run.

-- 1. Receipt status trigger must not write the generated column customer_receipts.unallocated_amount
CREATE OR REPLACE FUNCTION public.update_receipt_status()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid := COALESCE(NEW.receipt_id, OLD.receipt_id); v_total numeric; v_alloc numeric;
BEGIN
  SELECT total_amount INTO v_total FROM customer_receipts WHERE id = v_id;
  SELECT COALESCE(SUM(allocated_amount),0) INTO v_alloc FROM receipt_allocations WHERE receipt_id = v_id;
  UPDATE customer_receipts SET
    allocated_amount = v_alloc,
    status = CASE WHEN v_alloc = 0 THEN 'pending' WHEN v_alloc < v_total THEN 'partially_allocated' ELSE 'fully_allocated' END,
    updated_at = now()
  WHERE id = v_id;
  RETURN COALESCE(NEW, OLD);
END; $function$;

-- 2. New columns
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS vehicle_no text,
  ADD COLUMN IF NOT EXISTS lr_date date,
  ADD COLUMN IF NOT EXISTS bl_no text,
  ADD COLUMN IF NOT EXISTS bl_date date,
  ADD COLUMN IF NOT EXISTS port_of_loading text,
  ADD COLUMN IF NOT EXISTS port_of_discharge text,
  ADD COLUMN IF NOT EXISTS vessel_flight text,
  ADD COLUMN IF NOT EXISTS pre_carriage_by text,
  ADD COLUMN IF NOT EXISTS place_of_receipt text,
  ADD COLUMN IF NOT EXISTS final_destination text,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS kind_of_packages text;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS bl_no text,
  ADD COLUMN IF NOT EXISTS bl_date date,
  ADD COLUMN IF NOT EXISTS pre_carriage_by text,
  ADD COLUMN IF NOT EXISTS place_of_receipt text,
  ADD COLUMN IF NOT EXISTS payment_terms_text text;

ALTER TABLE public.finance_settings
  ADD COLUMN IF NOT EXISTS default_port_of_loading text DEFAULT 'NHAVA SHEVA (JNPT)';
UPDATE public.finance_settings SET default_port_of_loading = 'NHAVA SHEVA (JNPT)' WHERE default_port_of_loading IS NULL;

-- 3. Default payment terms text for a sales order
CREATE OR REPLACE FUNCTION public.so_payment_terms_text(p_so_id uuid)
 RETURNS text LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN coalesce(so.advance_percent,0) >= 100 THEN '100% ADVANCE'
    WHEN coalesce(so.advance_percent,0) > 0 THEN round(so.advance_percent)::text || '% ADVANCE & BALANCE AGAINST COPY OF BL'
    WHEN so.payment_terms_days IS NOT NULL THEN 'NET ' || so.payment_terms_days || ' DAYS'
  END
  FROM sales_orders so WHERE so.id = p_so_id;
$function$;

-- 4. Copy a shipment's shipping details onto its invoices (security definer: logistics users cannot write invoices)
CREATE OR REPLACE FUNCTION public.apply_shipment_details_to_invoices(p_shipment_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE invoices i SET
    port_of_loading   = coalesce(nullif(s.port_of_loading,''), i.port_of_loading),
    port_of_discharge = coalesce(nullif(s.port_of_discharge,''), i.port_of_discharge),
    vessel_flight     = coalesce(nullif(s.vessel_flight,''), i.vessel_flight),
    final_destination = coalesce(nullif(s.final_destination,''), i.final_destination),
    kind_of_packages  = coalesce(nullif(s.kind_of_packages,''), i.kind_of_packages),
    pre_carriage_by   = coalesce(nullif(s.pre_carriage_by,''), i.pre_carriage_by),
    place_of_receipt  = coalesce(nullif(s.place_of_receipt,''), i.place_of_receipt),
    bl_no             = coalesce(nullif(s.bl_no,''), i.bl_no),
    bl_date           = coalesce(s.bl_date, i.bl_date),
    payment_terms_text = coalesce(nullif(s.payment_terms,''), i.payment_terms_text, public.so_payment_terms_text(coalesce(i.so_id, s.so_id)))
  FROM shipments s
  WHERE s.id = p_shipment_id AND i.shipment_id = s.id;
END; $function$;

CREATE OR REPLACE FUNCTION public.trg_shipment_details_to_invoices()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.apply_shipment_details_to_invoices(NEW.id);
  -- keep the gate OUT entries in step with vehicle / transporter / LR
  UPDATE gate_register SET
    vehicle_no = coalesce(nullif(NEW.vehicle_no,''), vehicle_no),
    transporter = coalesce(nullif(NEW.transporter_name,''), transporter),
    lr_no = coalesce(nullif(NEW.lr_no,''), lr_no)
  WHERE direction = 'OUT' AND challan_no = NEW.ship_id;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS shipment_details_to_invoices ON public.shipments;
CREATE TRIGGER shipment_details_to_invoices
  AFTER UPDATE OF vehicle_no, transporter_name, lr_no, lr_date, bl_no, bl_date, port_of_loading, port_of_discharge,
    vessel_flight, pre_carriage_by, place_of_receipt, final_destination, payment_terms, kind_of_packages
  ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.trg_shipment_details_to_invoices();

-- 5. Invoice creation picks up the shipment's details
DO $do$
DECLARE d text := pg_get_functiondef('public.create_invoice_from_shipment(uuid,jsonb,jsonb)'::regprocedure);
BEGIN
  IF position('apply_shipment_details_to_invoices' in d) = 0 THEN
    d := replace(d, '  RETURNING id INTO v_inv_id;
',
      '  RETURNING id INTO v_inv_id;
  PERFORM public.apply_shipment_details_to_invoices(p_shipment_id);
');
    IF position('apply_shipment_details_to_invoices' in d) = 0 THEN RAISE EXCEPTION 'create_invoice_from_shipment: insert point not found'; END IF;
  END IF;
  -- invoice line description = item master name
  d := replace(d, 'coalesce(v_n.item_description, v_n.item_code),',
    'coalesce((SELECT nullif(trim(im.item_name),'''') FROM item_master im WHERE im.item_code = v_n.item_code LIMIT 1), v_n.item_code),');
  EXECUTE d;
END $do$;

-- 6. create_dispatch_shipment takes the shipping details (p_shipping) and stores them
DROP FUNCTION IF EXISTS public.create_dispatch_shipment(jsonb, text);
CREATE OR REPLACE FUNCTION public.create_dispatch_shipment(p_items jsonb, p_remarks text DEFAULT NULL::text, p_shipping jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_c record;
  v_qty integer;
  v_customers integer;
  v_customer_id uuid;
  v_customer_name text;
  v_customer_country text;
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
  v_gross numeric;
  v_s jsonb := coalesce(p_shipping, '{}'::jsonb);
  v_default_pol text;
  v_vehicle text; v_transporter text; v_lr text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Select at least one carton to dispatch'; END IF;

  SELECT array_agg((e->>'carton_id')::uuid) INTO v_carton_ids FROM jsonb_array_elements(p_items) e;

  SELECT count(DISTINCT coalesce(so.customer_id::text, wo.customer_id::text, wo.customer)),
         min(coalesce(so.customer_id, wo.customer_id)::text)::uuid,
         min(coalesce(cm.customer_name, so.customer, wo.customer)),
         min(cm.country),
         count(DISTINCT wo.so_id), min(wo.so_id::text)::uuid
  INTO v_customers, v_customer_id, v_customer_name, v_customer_country, v_sos, v_so_id
  FROM cartons c JOIN work_orders wo ON wo.id = c.wo_id
  LEFT JOIN sales_orders so ON so.id = wo.so_id
  LEFT JOIN customer_master cm ON cm.id = coalesce(so.customer_id, wo.customer_id)
  WHERE c.id = ANY(v_carton_ids);
  IF v_customers > 1 THEN RAISE EXCEPTION 'One shipment can only carry one customer; the selected cartons belong to % customers', v_customers; END IF;

  SELECT default_port_of_loading INTO v_default_pol FROM finance_settings LIMIT 1;
  v_vehicle := nullif(trim(v_s->>'vehicle_no'),'');
  v_transporter := nullif(trim(v_s->>'transporter_name'),'');
  v_lr := nullif(trim(v_s->>'lr_no'),'');

  v_ship_no := public.next_document_number('shipment', 'SHP');
  INSERT INTO shipments (ship_id, customer, customer_id, so_id, status, ship_date, shipped_at,
    vehicle_no, transporter_name, carrier, lr_no, lr_date, bl_no, bl_date, port_of_loading, port_of_discharge, vessel_flight,
    pre_carriage_by, place_of_receipt, final_destination, payment_terms, kind_of_packages, ship_to_address)
  VALUES (v_ship_no, coalesce(v_customer_name,'Unknown'), v_customer_id, CASE WHEN v_sos = 1 THEN v_so_id END, 'dispatched', now(), now(),
    v_vehicle, v_transporter, nullif(trim(v_s->>'carrier'),''), v_lr, nullif(v_s->>'lr_date','')::date,
    nullif(trim(v_s->>'bl_no'),''), nullif(v_s->>'bl_date','')::date,
    coalesce(nullif(trim(v_s->>'port_of_loading'),''), v_default_pol),
    nullif(trim(v_s->>'port_of_discharge'),''),
    nullif(trim(v_s->>'vessel_flight'),''),
    coalesce(nullif(trim(v_s->>'pre_carriage_by'),''), 'N.A.'),
    coalesce(nullif(trim(v_s->>'place_of_receipt'),''), 'N.A.'),
    coalesce(nullif(trim(v_s->>'final_destination'),''), v_customer_country),
    coalesce(nullif(trim(v_s->>'payment_terms'),''), CASE WHEN v_sos = 1 THEN public.so_payment_terms_text(v_so_id) END),
    coalesce(nullif(trim(v_s->>'kind_of_packages'),''), 'BOXES'),
    nullif(trim(v_s->>'ship_to_address'),''))
  RETURNING id INTO v_ship_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::integer;
    SELECT c.id, c.carton_id, c.wo_id, c.production_batch_id, c.quantity, c.net_weight, c.gross_weight,
           wo.item_code, wo.so_id, wo.quantity AS wo_qty, wo.customer, wo.gross_weight_per_pc, wo.net_weight_per_pc,
           wo.financial_snapshot, sli.price_per_pc AS line_price, sli.currency AS line_currency, sli.quantity AS line_qty,
           so.currency AS so_currency, im.item_name
    INTO v_c
    FROM cartons c JOIN work_orders wo ON wo.id = c.wo_id
    LEFT JOIN sales_order_line_items sli ON sli.id = wo.sales_order_line_id OR (wo.sales_order_line_id IS NULL AND sli.work_order_id = wo.id)
    LEFT JOIN sales_orders so ON so.id = wo.so_id
    LEFT JOIN LATERAL (SELECT nullif(trim(item_name),'') AS item_name FROM item_master WHERE item_code = wo.item_code LIMIT 1) im ON true
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
      coalesce(v_c.item_code,'N/A'), coalesce(v_c.item_name, v_c.item_code, 'N/A'),
      coalesce(v_c.line_qty, v_c.wo_qty), v_qty, v_qty, 0, now(),
      v_rate, v_currency,
      CASE WHEN coalesce(v_c.gross_weight,0) > 0 AND v_c.quantity > 0 THEN round(v_c.gross_weight * v_qty / v_c.quantity, 3)
           WHEN v_c.gross_weight_per_pc IS NOT NULL THEN round(v_qty * v_c.gross_weight_per_pc / 1000, 3) END,
      CASE WHEN coalesce(v_c.net_weight,0) > 0 AND v_c.quantity > 0 THEN round(v_c.net_weight * v_qty / v_c.quantity, 3)
           WHEN v_c.net_weight_per_pc IS NOT NULL THEN round(v_qty * v_c.net_weight_per_pc / 1000, 3) END,
      v_uid, CASE WHEN v_qty < v_c.quantity THEN 'Partial dispatch: ' || v_qty || '/' || v_c.quantity END);
    v_notes := v_notes || v_dn_no;
    v_gross := CASE WHEN coalesce(v_c.gross_weight,0) > 0 AND v_c.quantity > 0 THEN round(v_c.gross_weight * v_qty / v_c.quantity, 3) WHEN v_c.gross_weight_per_pc IS NOT NULL THEN round(v_qty * v_c.gross_weight_per_pc / 1000, 3) ELSE 0 END;
    INSERT INTO gate_register (direction, material_type, gross_weight_kg, estimated_pcs, unit, item_name, party_code, customer_id, work_order_id, challan_no, dc_number, vehicle_no, transporter, lr_no, qc_required, qc_status, status, remarks, created_by)
    VALUES ('OUT', 'finished_goods', coalesce(v_gross,0), v_qty, 'pcs', v_c.item_code, coalesce(v_customer_name, v_c.customer), v_customer_id, v_c.wo_id, v_ship_no, v_dn_no, v_vehicle, v_transporter, v_lr, false, 'not_required', 'completed', 'Auto: Dispatch ' || v_ship_no || ' - ' || v_c.carton_id || ' - ' || v_qty || ' pcs', v_uid);
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
END; $function$;

GRANT EXECUTE ON FUNCTION public.create_dispatch_shipment(jsonb, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.so_payment_terms_text(uuid) TO authenticated;

-- 7. Fix existing test data descriptions
UPDATE dispatch_notes dn SET item_description = im.item_name
FROM item_master im WHERE im.item_code = dn.item_code AND nullif(trim(im.item_name),'') IS NOT NULL
  AND dn.item_description LIKE dn.item_code || ' - %';
