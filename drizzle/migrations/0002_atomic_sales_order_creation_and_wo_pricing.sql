ALTER TABLE public.sales_order_line_items ADD COLUMN price_per_pc numeric, ADD COLUMN line_amount numeric, ADD COLUMN currency text;
ALTER TABLE public.work_orders ADD COLUMN split_reason text, ADD COLUMN sales_order_line_id uuid REFERENCES public.sales_order_line_items(id);
UPDATE public.sales_order_line_items l SET price_per_pc=COALESCE((s.items->(l.line_number-1)->>'price_per_pc')::numeric,s.price_per_pc),line_amount=COALESCE((s.items->(l.line_number-1)->>'line_amount')::numeric,(s.items->(l.line_number-1)->>'price_per_pc')::numeric*l.quantity,s.price_per_pc*l.quantity),currency=COALESCE(s.currency,'USD') FROM public.sales_orders s WHERE s.id=l.sales_order_id AND s.items->(l.line_number-1)->>'item_code'=l.item_code;
UPDATE public.work_orders w SET sales_order_line_id=l.id FROM public.sales_order_line_items l WHERE l.work_order_id=w.id;
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.auto_generate_work_order_from_line_item()'::regprocedure);
 definition:=replace(definition,$find$'price_per_pc', NULL$find$,$replacement$'price_per_pc', NEW.price_per_pc$replacement$);
 definition:=replace(definition,$find$'line_amount', NULL$find$,$replacement$'line_amount', COALESCE(NEW.line_amount, NEW.price_per_pc * NEW.quantity), 'currency', COALESCE(NEW.currency, so_record.currency, 'USD')$replacement$);
 definition:=replace(definition,$find$'currency', COALESCE(so_record.currency, 'USD')$find$,$replacement$'currency', COALESCE(NEW.currency, so_record.currency, 'USD')$replacement$);
 definition:=replace(definition,'-- Link WO back to line item','UPDATE public.work_orders SET sales_order_line_id = NEW.id WHERE id = new_wo_uuid; -- Link WO back to line item');
 EXECUTE definition;
END $$;
CREATE FUNCTION public.create_sales_order(p_header jsonb,p_lines jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s public.sales_orders; l jsonb; line_count integer; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'At least one sales order line is required'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_lines) v WHERE COALESCE(v->>'item_code','')='' OR COALESCE((v->>'quantity')::integer,0)<=0 OR NULLIF(v->>'due_date','') IS NULL) THEN RAISE EXCEPTION 'All line items must have item code, quantity, and due date'; END IF;
 INSERT INTO public.sales_orders(so_id,customer,customer_id,party_code,po_number,po_date,currency,payment_terms_days,incoterm,expected_delivery_date,drawing_number,advance_payment,items,total_amount,status,created_by) VALUES ('',p_header->>'customer',(p_header->>'customer_id')::uuid,p_header->>'party_code',p_header->>'po_number',NULLIF(p_header->>'po_date','')::date,p_header->>'currency',(p_header->>'payment_terms_days')::integer,p_header->>'incoterm',NULLIF(p_header->>'expected_delivery_date','')::date,p_header->>'drawing_number',NULLIF(p_header->'advance_payment','null'::jsonb),p_header->'items',(p_header->>'total_amount')::numeric,'pending',auth.uid()) RETURNING * INTO s;
 FOR l IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
 INSERT INTO public.sales_order_line_items(sales_order_id,line_number,item_code,quantity,due_date,drawing_number,item_id,price_per_pc,line_amount,currency,status) VALUES(s.id,(l->>'line_number')::integer,l->>'item_code',(l->>'quantity')::integer,(l->>'due_date')::date,l->>'drawing_number',NULLIF(l->>'item_id','')::uuid,(l->>'price_per_pc')::numeric,COALESCE((l->>'line_amount')::numeric,(l->>'price_per_pc')::numeric*(l->>'quantity')::integer),COALESCE(l->>'currency',s.currency),'pending');
 END LOOP;
 UPDATE public.sales_order_line_items SET status='approved',approved_by=auth.uid(),approved_at=now() WHERE sales_order_id=s.id;
 SELECT count(*) INTO line_count FROM public.sales_order_line_items WHERE sales_order_id=s.id AND work_order_id IS NOT NULL;
 IF line_count<>jsonb_array_length(p_lines) THEN RAISE EXCEPTION 'Work order generation did not complete for every line'; END IF;
 UPDATE public.sales_orders SET status='approved',approved_by=auth.uid(),approved_at=now() WHERE id=s.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sales order approval not permitted' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('id',s.id,'so_id',s.so_id,'wo_numbers',COALESCE(jsonb_agg(w.wo_number ORDER BY l.line_number),'[]'::jsonb)) INTO result FROM public.sales_order_line_items l JOIN public.work_orders w ON w.id=l.work_order_id WHERE l.sales_order_id=s.id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.create_sales_order(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_sales_order(jsonb,jsonb) TO authenticated;
CREATE FUNCTION public.recover_missing_work_orders(p_line_ids uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE l public.sales_order_line_items; numbers jsonb:='[]'::jsonb; number text; linked uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_department_type(auth.uid(),'admin') OR public.has_department_type(auth.uid(),'super_admin')) THEN RAISE EXCEPTION 'Admin department required' USING ERRCODE='42501'; END IF;
 FOR l IN SELECT li.* FROM public.sales_order_line_items li JOIN public.sales_orders s ON s.id=li.sales_order_id WHERE li.id=ANY(p_line_ids) AND li.status='approved' AND s.status='approved' AND NOT s.is_archived FOR UPDATE OF li LOOP
 IF EXISTS (SELECT 1 FROM public.work_orders w WHERE NOT w.is_archived AND (w.id=l.work_order_id OR w.sales_order_line_id=l.id)) THEN CONTINUE; END IF;
 UPDATE public.sales_order_line_items SET status='pending',work_order_id=NULL WHERE id=l.id;
 UPDATE public.sales_order_line_items SET status='approved',approved_by=auth.uid(),approved_at=now() WHERE id=l.id;
 SELECT work_order_id INTO linked FROM public.sales_order_line_items WHERE id=l.id;
 IF linked IS NULL THEN RAISE EXCEPTION 'Work order generation failed for line %',l.id; END IF;
 SELECT wo_number INTO number FROM public.work_orders WHERE id=linked;
 numbers:=numbers||jsonb_build_array(number);
 END LOOP;
 RETURN jsonb_build_object('wo_numbers',numbers);
END $$;
REVOKE ALL ON FUNCTION public.recover_missing_work_orders(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recover_missing_work_orders(uuid[]) TO authenticated;
CREATE FUNCTION public.validate_wo_manufacturing_split() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE line public.sales_order_line_items;
BEGIN
 IF NEW.sales_order_line_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO line FROM public.sales_order_line_items WHERE id=NEW.sales_order_line_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.sales_orders s WHERE s.id=line.sales_order_id AND s.status='approved' AND NOT s.is_archived) OR line.status<>'approved' THEN RAISE EXCEPTION 'Select an approved, non-archived SO line'; END IF;
 IF NEW.so_id IS DISTINCT FROM line.sales_order_id THEN RAISE EXCEPTION 'SO line does not belong to the selected order'; END IF;
 IF EXISTS(SELECT 1 FROM public.work_orders w WHERE NOT w.is_archived AND (w.sales_order_line_id=line.id OR w.id=line.work_order_id) AND w.id<>NEW.id) AND (NEW.split_reason IS NULL OR NEW.split_reason NOT IN ('different route','different component','different material/spec','separately controlled packaging/configuration','spec change after production started')) THEN RAISE EXCEPTION 'A second WO requires a distinct manufacturing requirement. Same part made in several runs = Production Batches, not a new WO'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_wo_manufacturing_split BEFORE INSERT ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.validate_wo_manufacturing_split();