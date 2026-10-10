CREATE OR REPLACE FUNCTION public.sync_rpo_on_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_total_received numeric; v_ordered_qty numeric; v_material_req_id uuid;
BEGIN
 SELECT qty_ordered_kg,material_requirement_id INTO v_ordered_qty,v_material_req_id FROM public.raw_purchase_orders WHERE id=NEW.rpo_id FOR UPDATE;
 SELECT COALESCE(SUM(qty_received_kg),0) INTO v_total_received FROM public.raw_po_receipts WHERE rpo_id=NEW.rpo_id;
 UPDATE public.raw_purchase_orders SET status=CASE WHEN v_total_received>=v_ordered_qty THEN 'closed'::public.rpo_status WHEN v_total_received>0 THEN 'part_received'::public.rpo_status ELSE 'approved'::public.rpo_status END,incoming_qc_status='pending',updated_at=now() WHERE id=NEW.rpo_id;
 IF v_material_req_id IS NOT NULL THEN
  IF v_total_received>=v_ordered_qty THEN UPDATE public.material_requirements SET status='fulfilled',updated_at=now() WHERE id=v_material_req_id;
  ELSIF v_total_received>0 THEN UPDATE public.material_requirements SET status='partially_fulfilled',updated_at=now() WHERE id=v_material_req_id; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_inventory_to_material_lots()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- Atomic goods-in uses the lot already created by the gate trigger. Do not duplicate it or overwrite gross weight with net weight.
 IF EXISTS(SELECT 1 FROM public.material_lots WHERE lot_id=NEW.lot_id) THEN RETURN NEW; END IF;
 INSERT INTO public.material_lots(lot_id,heat_no,alloy,material_size_mm,gross_weight,net_weight,supplier,status,qc_status,po_id)
 VALUES(NEW.lot_id,NEW.heat_no,COALESCE(NEW.alloy,'Unknown'),NEW.material_size_mm,NEW.qty_kg,NEW.qty_kg,(SELECT name FROM public.suppliers WHERE id=NEW.supplier_id),'received','pending',NEW.rpo_id)
 ON CONFLICT(lot_id) DO UPDATE SET gross_weight=EXCLUDED.gross_weight,net_weight=EXCLUDED.net_weight,updated_at=now();
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.receive_raw_material(p_entry jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE g public.gate_register; r public.raw_purchase_orders; v_lot public.material_lots; v_net numeric; v_total numeric; v_delta numeric; v_qc_id uuid; v_step public.operation_routes; v_out_of_sequence boolean:=false;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_entry->>'direction' IS DISTINCT FROM 'IN' OR p_entry->>'material_type' IS DISTINCT FROM 'raw_material' THEN RAISE EXCEPTION 'This function accepts raw-material goods-in only'; END IF;
 IF COALESCE(p_entry->>'heat_no','')='' THEN RAISE EXCEPTION 'Heat number is required'; END IF;
 IF COALESCE((p_entry->>'gross_weight_kg')::numeric,0)<=0 THEN RAISE EXCEPTION 'Gross weight is required'; END IF;
 v_net:=(p_entry->>'net_weight_kg')::numeric;
 IF v_net IS NULL OR abs(v_net-((p_entry->>'gross_weight_kg')::numeric-COALESCE((p_entry->>'tare_weight_kg')::numeric,0)))>0.000001 THEN RAISE EXCEPTION 'Net weight must equal gross weight minus tare weight'; END IF;
 IF NULLIF(p_entry->>'rpo_id','') IS NOT NULL THEN
  SELECT * INTO r FROM public.raw_purchase_orders WHERE id=(p_entry->>'rpo_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order is unavailable'; END IF;
  IF r.status NOT IN ('approved','part_received') THEN RAISE EXCEPTION 'Only approved or part-received purchase orders can receive material'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext('raw_material_gate_entry_number'));
 INSERT INTO public.gate_register(direction,material_type,gate_entry_no,gross_weight_kg,tare_weight_kg,status,estimated_pcs,avg_weight_per_pc,pcs_sample_count,pcs_sample_weight,item_name,rod_section_size,material_grade,alloy,heat_no,tc_number,packaging_type_id,packaging_count,supplier_id,supplier_name,party_code,customer_id,partner_id,process_type,work_order_id,rpo_id,challan_no,dc_number,vehicle_no,transporter,qc_required,qc_status,remarks,created_by)
 VALUES('IN','raw_material',p_entry->>'gate_entry_no',(p_entry->>'gross_weight_kg')::numeric,COALESCE((p_entry->>'tare_weight_kg')::numeric,0),'completed',(p_entry->>'estimated_pcs')::integer,(p_entry->>'avg_weight_per_pc')::numeric,(p_entry->>'pcs_sample_count')::integer,(p_entry->>'pcs_sample_weight')::numeric,p_entry->>'item_name',p_entry->>'rod_section_size',p_entry->>'material_grade',p_entry->>'alloy',p_entry->>'heat_no',p_entry->>'tc_number',NULLIF(p_entry->>'packaging_type_id','')::uuid,(p_entry->>'packaging_count')::integer,NULLIF(p_entry->>'supplier_id','')::uuid,p_entry->>'supplier_name',p_entry->>'party_code',NULLIF(p_entry->>'customer_id','')::uuid,NULLIF(p_entry->>'partner_id','')::uuid,p_entry->>'process_type',NULLIF(p_entry->>'work_order_id','')::uuid,r.id,p_entry->>'challan_no',p_entry->>'dc_number',p_entry->>'vehicle_no',p_entry->>'transporter',COALESCE((p_entry->>'qc_required')::boolean,false),CASE WHEN COALESCE((p_entry->>'qc_required')::boolean,false) THEN 'pending' ELSE 'not_required' END,p_entry->>'remarks',auth.uid()) RETURNING * INTO g;
 -- net_weight_kg is a generated column; supplied net weight is validated above, never inserted into that column.
 SELECT * INTO v_lot FROM public.material_lots WHERE lot_id='LOT-'||g.gate_entry_no;
 IF NOT FOUND THEN RAISE EXCEPTION 'Gate entry did not create a material lot'; END IF;
 INSERT INTO public.inventory_lots(lot_id,material_size_mm,alloy,qty_kg,supplier_id,rpo_id,heat_no,received_date,cost_rate)
 VALUES(v_lot.lot_id,COALESCE(g.rod_section_size,'N/A'),COALESCE(g.alloy,'N/A'),v_net,g.supplier_id,r.id,g.heat_no,CURRENT_DATE,r.rate_per_kg);
 IF r.id IS NOT NULL THEN
  INSERT INTO public.raw_po_receipts(rpo_id,gi_ref,gate_register_id,received_date,qty_received_kg,supplier_invoice_no,lr_no,transporter,notes)
  VALUES(r.id,v_lot.id,g.id,CURRENT_DATE,v_net,g.challan_no,NULL,g.transporter,trim('Gate Entry: '||g.gate_entry_no||'. '||COALESCE(g.remarks,'')));
  SELECT COALESCE(SUM(qty_received_kg),0) INTO v_total FROM public.raw_po_receipts WHERE rpo_id=r.id;
  UPDATE public.raw_purchase_orders SET status=CASE WHEN v_total>=r.qty_ordered_kg THEN 'closed'::public.rpo_status ELSE 'part_received'::public.rpo_status END,updated_at=now() WHERE id=r.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order update not permitted' USING ERRCODE='42501'; END IF;
  v_delta:=v_total-r.qty_ordered_kg;
  IF v_total>=r.qty_ordered_kg AND abs(v_delta)>0.1 THEN
   INSERT INTO public.raw_po_reconciliations(rpo_id,qty_delta_kg,amount_delta,reason,resolution,notes)
   VALUES(r.id,v_delta,v_delta*r.rate_per_kg,CASE WHEN v_delta<0 THEN 'short_supply'::public.reconciliation_reason ELSE 'excess_supply'::public.reconciliation_reason END,'pending','Auto-created on RPO closure. Gate Entry: '||g.gate_entry_no);
  END IF;
 END IF;
 IF g.work_order_id IS NOT NULL THEN
  SELECT * INTO v_step FROM public.operation_routes WHERE work_order_id=g.work_order_id AND operation_type='RAW_MATERIAL' AND (process_name IS NULL OR process_name='Raw Material Receipt') ORDER BY sequence_number LIMIT 1;
  IF v_step.id IS NOT NULL THEN
   SELECT EXISTS(SELECT 1 FROM public.operation_routes prev WHERE prev.work_order_id=g.work_order_id AND prev.sequence_number<v_step.sequence_number AND prev.is_mandatory AND NOT EXISTS(SELECT 1 FROM public.execution_records e WHERE e.work_order_id=g.work_order_id AND e.operation_type=prev.operation_type AND (prev.process_name IS NULL OR e.process_name=prev.process_name))) INTO v_out_of_sequence;
  END IF;
  INSERT INTO public.execution_records(work_order_id,operation_type,process_name,quantity,unit,direction,created_by,out_of_sequence,route_step_id) VALUES(g.work_order_id,'RAW_MATERIAL','Raw Material Receipt',v_net,'kg','IN',auth.uid(),v_out_of_sequence,v_step.id);
  IF g.qc_required THEN
   SELECT id INTO v_qc_id FROM public.qc_records WHERE wo_id=g.work_order_id AND qc_type='incoming' AND batch_id IS NULL ORDER BY created_at DESC LIMIT 1;
   IF v_qc_id IS NOT NULL THEN
    UPDATE public.qc_records SET heat_no=g.heat_no,material_grade=COALESCE(g.alloy,g.material_grade),material_lot_id=v_lot.id,remarks='Auto-created from Gate Register '||g.gate_entry_no||'. Qty: '||v_net||' kg' WHERE id=v_qc_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Incoming QC update not permitted' USING ERRCODE='42501'; END IF;
   ELSE
    INSERT INTO public.qc_records(qc_id,wo_id,qc_type,result,heat_no,material_grade,material_lot_id,remarks,inspected_quantity) VALUES('QC-INC-'||g.gate_entry_no,g.work_order_id,'incoming','pending',g.heat_no,COALESCE(g.alloy,g.material_grade),v_lot.id,'Auto-created from Gate Register '||g.gate_entry_no||'. Qty: '||v_net||' kg',0);
   END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('gate_entry_no',g.gate_entry_no,'lot_id',v_lot.lot_id,'material_lot_id',v_lot.id,'gate_entry',to_jsonb(g));
END $$;
REVOKE ALL ON FUNCTION public.receive_raw_material(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.receive_raw_material(jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.sync_lot_qc_to_gate_register()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.qc_status IN ('pass','fail') THEN
  UPDATE public.gate_register g SET qc_status=CASE NEW.qc_status WHEN 'pass' THEN 'passed' ELSE 'failed' END
  WHERE g.direction='IN' AND g.material_type='raw_material' AND (
   NEW.lot_id='LOT-'||g.gate_entry_no OR NEW.lot_id='ML-'||g.gate_entry_no||'-'||g.heat_no OR NEW.lot_id='LOT-'||g.gate_entry_no||'-'||g.heat_no
   OR EXISTS(SELECT 1 FROM public.raw_po_receipts receipt WHERE receipt.gi_ref=NEW.id AND receipt.gate_register_id=g.id));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_lot_qc_to_gate_register() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_lot_qc_to_gate_register_trigger AFTER UPDATE OF qc_status ON public.material_lots FOR EACH ROW WHEN(OLD.qc_status IS DISTINCT FROM NEW.qc_status) EXECUTE FUNCTION public.sync_lot_qc_to_gate_register();

CREATE OR REPLACE FUNCTION public.cancel_raw_purchase_order(p_rpo_id uuid,p_reason text,p_action text DEFAULT 'cancel')
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r public.raw_purchase_orders;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF NULLIF(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
 IF p_action NOT IN ('reject','cancel') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid action'; END IF;
 SELECT * INTO r FROM public.raw_purchase_orders WHERE id=p_rpo_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order is unavailable'; END IF;
 IF r.status<>'pending_approval' AND NOT(r.status='approved' AND p_action='cancel' AND NOT EXISTS(SELECT 1 FROM public.raw_po_receipts WHERE rpo_id=r.id AND qty_received_kg>0)) THEN RAISE EXCEPTION 'Only pending orders or approved orders with nothing received can be cancelled'; END IF;
 UPDATE public.raw_purchase_orders SET status='cancelled',remarks=concat_ws(E'\n',NULLIF(remarks,''),initcap(p_action)||' reason: '||trim(p_reason)),updated_at=now() WHERE id=r.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cancellation not permitted' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',r.id,'status','cancelled');
END $$;
REVOKE ALL ON FUNCTION public.cancel_raw_purchase_order(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_raw_purchase_order(uuid,text,text) TO authenticated,service_role;