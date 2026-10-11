DO $mig$
DECLARE d text; n text;
BEGIN
  -- 1) invoices.gross_amount is generated: never write it
  d := pg_get_functiondef('public.create_invoice_from_shipment(uuid,jsonb,jsonb)'::regprocedure);
  n := replace(d, '    gross_amount = v_total,' || chr(10), '');
  IF n = d THEN RAISE EXCEPTION 'gross_amount anchor not found'; END IF;
  EXECUTE n;

  -- 2) customer_receipts.unallocated_amount is generated
  d := pg_get_functiondef('public.record_advance_receipt'::regproc);
  n := replace(replace(d, 'allocated_amount, unallocated_amount,', 'allocated_amount,'), 'p_amount, 0, p_amount,', 'p_amount, 0,');
  IF n = d THEN RAISE EXCEPTION 'unallocated anchor not found'; END IF;
  EXECUTE n;

  -- 5) Gate OUT entry inside create_dispatch_shipment
  d := pg_get_functiondef('public.create_dispatch_shipment'::regproc);
  n := replace(d, '  v_w record;' || chr(10), '  v_w record;' || chr(10) || '  v_gross numeric;' || chr(10));
  n := replace(n, '    v_notes := v_notes || v_dn_no;' || chr(10),
    '    v_notes := v_notes || v_dn_no;' || chr(10) ||
    '    v_gross := CASE WHEN coalesce(v_c.gross_weight,0) > 0 AND v_c.quantity > 0 THEN round(v_c.gross_weight * v_qty / v_c.quantity, 3)' ||
    ' WHEN v_c.gross_weight_per_pc IS NOT NULL THEN round(v_qty * v_c.gross_weight_per_pc / 1000, 3) ELSE 0 END;' || chr(10) ||
    '    INSERT INTO gate_register (direction, material_type, gross_weight_kg, estimated_pcs, unit, item_name, party_code,' ||
    ' customer_id, work_order_id, challan_no, dc_number, qc_required, qc_status, status, remarks, created_by)' || chr(10) ||
    '    VALUES (''OUT'', ''finished_goods'', coalesce(v_gross,0), v_qty, ''pcs'', v_c.item_code, coalesce(v_customer_name, v_c.customer),' ||
    ' v_customer_id, v_c.wo_id, v_ship_no, v_dn_no, false, ''not_required'', ''completed'',' ||
    ' ''Auto: Dispatch '' || v_ship_no || '' - '' || v_c.carton_id || '' - '' || v_qty || '' pcs'', v_uid);' || chr(10));
  IF position('INSERT INTO gate_register' in n) = 0 OR position('v_gross numeric' in n) = 0 THEN RAISE EXCEPTION 'dispatch anchors not found'; END IF;
  EXECUTE n;
END $mig$;

-- 4) WO Raw Material QC result flows to the lots received for that WO's RPOs (gate QC follows via sync_lot_qc_to_gate_register)
CREATE OR REPLACE FUNCTION public.sync_wo_incoming_qc_to_lots()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_status text;
BEGIN
  IF NEW.qc_type::text <> 'incoming' OR NEW.wo_id IS NULL OR NEW.result IS NULL THEN RETURN NEW; END IF;
  v_status := CASE NEW.result::text WHEN 'pass' THEN 'pass' WHEN 'fail' THEN 'fail' ELSE NULL END;
  IF v_status IS NULL THEN RETURN NEW; END IF;
  UPDATE public.material_lots ml SET qc_status = v_status
  WHERE ml.id IN (SELECT r.gi_ref FROM public.raw_po_receipts r JOIN public.raw_purchase_orders p ON p.id = r.rpo_id
                  WHERE p.wo_id = NEW.wo_id AND r.gi_ref IS NOT NULL)
    AND ml.qc_status IS DISTINCT FROM v_status;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_sync_wo_incoming_qc_to_lots ON public.qc_records;
CREATE TRIGGER trg_sync_wo_incoming_qc_to_lots AFTER INSERT OR UPDATE OF result ON public.qc_records
  FOR EACH ROW EXECUTE FUNCTION public.sync_wo_incoming_qc_to_lots();