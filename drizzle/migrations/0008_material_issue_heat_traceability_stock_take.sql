-- Stock balance lives on material_lots (carries the heat)
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS available_kg numeric;
UPDATE public.material_lots ml SET available_kg = GREATEST(
  GREATEST(COALESCE(NULLIF(ml.net_weight,0), ml.gross_weight, 0), 0)
  - COALESCE((SELECT sum(quantity_kg) FROM public.wo_material_issues i WHERE i.lot_id = ml.id), 0), 0);
ALTER TABLE public.material_lots ALTER COLUMN available_kg SET DEFAULT 0;

CREATE OR REPLACE FUNCTION public.default_material_lot_available()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.available_kg IS NULL OR NEW.available_kg = 0 THEN
    NEW.available_kg := GREATEST(COALESCE(NULLIF(NEW.net_weight,0), NEW.gross_weight, 0), 0);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_material_lot_available ON public.material_lots;
CREATE TRIGGER trg_material_lot_available BEFORE INSERT ON public.material_lots
FOR EACH ROW EXECUTE FUNCTION public.default_material_lot_available();

ALTER TABLE public.wo_material_issues
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.production_batches(id),
  ADD COLUMN IF NOT EXISTS heat_no text;

-- Raw-material movements share inventory_movements
ALTER TABLE public.inventory_movements ALTER COLUMN inventory_id DROP NOT NULL;
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS material_lot_id uuid REFERENCES public.material_lots(id),
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.production_batches(id),
  ADD COLUMN IF NOT EXISTS quantity_kg numeric,
  ADD COLUMN IF NOT EXISTS heat_no text,
  ADD COLUMN IF NOT EXISTS scrap_type text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS stock_take_id uuid;
CREATE INDEX IF NOT EXISTS idx_inv_mov_material_lot ON public.inventory_movements(material_lot_id);

-- Goods in/out team (packing) may issue material
CREATE POLICY "Packing can manage WO material issues" ON public.wo_material_issues
  FOR ALL TO authenticated
  USING (public.has_any_department_type(auth.uid(), ARRAY['packing','super_admin']))
  WITH CHECK (public.has_any_department_type(auth.uid(), ARRAY['packing','super_admin']));
CREATE POLICY "Packing can update material lot balances" ON public.material_lots
  FOR UPDATE TO authenticated
  USING (public.has_any_department_type(auth.uid(), ARRAY['packing','super_admin']))
  WITH CHECK (public.has_any_department_type(auth.uid(), ARRAY['packing','super_admin']));

CREATE OR REPLACE FUNCTION public.issue_material_to_wo(p_wo_id uuid, p_lot_id uuid, p_batch_id uuid, p_kg numeric, p_pcs integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE l record; w record; v_issue uuid;
BEGIN
  IF p_kg IS NULL OR p_kg <= 0 THEN RAISE EXCEPTION 'Enter a quantity in kg greater than 0'; END IF;
  SELECT * INTO l FROM material_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material lot not found'; END IF;
  IF lower(COALESCE(l.qc_status,'pending')) NOT IN ('pass','passed','approved','waived') THEN
    RAISE EXCEPTION 'Lot % is not QC-passed (status: %)', l.lot_id, COALESCE(l.qc_status,'pending');
  END IF;
  IF p_kg > COALESCE(l.available_kg,0) THEN
    RAISE EXCEPTION 'Only % kg available in lot %', COALESCE(l.available_kg,0), l.lot_id;
  END IF;
  SELECT id INTO w FROM work_orders WHERE id = p_wo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Work order not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM production_batches WHERE id = p_batch_id AND wo_id = p_wo_id) THEN
    RAISE EXCEPTION 'Production batch does not belong to this work order';
  END IF;
  INSERT INTO wo_material_issues (wo_id, lot_id, batch_id, heat_no, quantity_kg, quantity_pcs, uom, issued_by)
  VALUES (p_wo_id, p_lot_id, p_batch_id, l.heat_no, p_kg, p_pcs, 'kg', auth.uid()) RETURNING id INTO v_issue;
  INSERT INTO inventory_movements (movement_type, quantity, quantity_kg, material_lot_id, batch_id, heat_no, work_order_id, created_by, notes)
  VALUES ('issue', COALESCE(p_pcs,0), p_kg, p_lot_id, p_batch_id, l.heat_no, p_wo_id, auth.uid(), 'Issued from lot ' || l.lot_id);
  UPDATE material_lots SET available_kg = available_kg - p_kg, updated_at = now() WHERE id = p_lot_id;
  RETURN jsonb_build_object('issue_id', v_issue, 'heat_no', l.heat_no, 'remaining_kg', l.available_kg - p_kg);
END $$;

CREATE OR REPLACE FUNCTION public.return_material_to_lot(p_wo_id uuid, p_lot_id uuid, p_batch_id uuid, p_kg numeric, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE l record; v_net numeric;
BEGIN
  IF p_kg IS NULL OR p_kg <= 0 THEN RAISE EXCEPTION 'Enter a quantity in kg greater than 0'; END IF;
  SELECT * INTO l FROM material_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material lot not found'; END IF;
  SELECT COALESCE(sum(CASE WHEN movement_type='issue' THEN quantity_kg WHEN movement_type IN ('return','scrap') THEN -quantity_kg ELSE 0 END),0)
    INTO v_net FROM inventory_movements
   WHERE material_lot_id = p_lot_id AND work_order_id = p_wo_id
     AND (p_batch_id IS NULL OR batch_id = p_batch_id);
  IF p_kg > v_net THEN RAISE EXCEPTION 'Cannot return % kg: only % kg of lot % is still with this WO/batch', p_kg, v_net, l.lot_id; END IF;
  INSERT INTO inventory_movements (movement_type, quantity, quantity_kg, material_lot_id, batch_id, heat_no, work_order_id, created_by, notes)
  VALUES ('return', 0, p_kg, p_lot_id, p_batch_id, l.heat_no, p_wo_id, auth.uid(), p_notes);
  UPDATE material_lots SET available_kg = available_kg + p_kg, updated_at = now() WHERE id = p_lot_id;
  RETURN jsonb_build_object('available_kg', l.available_kg + p_kg);
END $$;

CREATE OR REPLACE FUNCTION public.record_material_scrap(p_wo_id uuid, p_lot_id uuid, p_batch_id uuid, p_kg numeric, p_scrap_type text, p_location text DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_heat text; v_id uuid;
BEGIN
  IF p_kg IS NULL OR p_kg <= 0 THEN RAISE EXCEPTION 'Enter a quantity in kg greater than 0'; END IF;
  IF p_scrap_type NOT IN ('chips','bar_end','rejected_parts') THEN RAISE EXCEPTION 'Scrap type must be chips, bar end or rejected parts'; END IF;
  IF p_lot_id IS NOT NULL THEN SELECT heat_no INTO v_heat FROM material_lots WHERE id = p_lot_id; END IF;
  INSERT INTO inventory_movements (movement_type, quantity, quantity_kg, material_lot_id, batch_id, heat_no, work_order_id, scrap_type, location, created_by, notes)
  VALUES ('scrap', 0, p_kg, p_lot_id, p_batch_id, v_heat, p_wo_id, p_scrap_type, p_location, auth.uid(), p_notes)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('movement_id', v_id);
END $$;

-- Heats onto cartons
CREATE OR REPLACE FUNCTION public.fill_carton_heat_nos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_batch uuid := COALESCE(NEW.production_batch_id, NEW.batch_id); v_heats text[];
BEGIN
  IF NEW.heat_nos IS NULL OR array_length(NEW.heat_nos,1) IS NULL THEN
    SELECT array_agg(DISTINCT heat_no ORDER BY heat_no) INTO v_heats
      FROM wo_material_issues WHERE heat_no IS NOT NULL AND batch_id = v_batch;
    IF v_heats IS NULL THEN
      SELECT array_agg(DISTINCT heat_no ORDER BY heat_no) INTO v_heats
        FROM wo_material_issues WHERE heat_no IS NOT NULL AND wo_id = NEW.wo_id;
    END IF;
    NEW.heat_nos := COALESCE(v_heats, NEW.heat_nos);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fill_carton_heat_nos ON public.cartons;
CREATE TRIGGER trg_fill_carton_heat_nos BEFORE INSERT ON public.cartons
FOR EACH ROW EXECUTE FUNCTION public.fill_carton_heat_nos();

-- Monthly stock take (raw-material lots)
CREATE TABLE public.stock_takes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  take_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'counting' CHECK (status IN ('counting','approved')),
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz
);
CREATE TABLE public.stock_take_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_take_id uuid NOT NULL REFERENCES public.stock_takes(id) ON DELETE CASCADE,
  material_lot_id uuid NOT NULL REFERENCES public.material_lots(id),
  system_kg numeric NOT NULL,
  physical_kg numeric,
  variance_kg numeric GENERATED ALWAYS AS (physical_kg - system_kg) STORED,
  UNIQUE (stock_take_id, material_lot_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_takes, public.stock_take_lines TO authenticated;
GRANT ALL ON public.stock_takes, public.stock_take_lines TO service_role;
ALTER TABLE public.stock_takes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_take_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Stock take team manages stock takes" ON public.stock_takes FOR ALL TO authenticated
  USING (public.has_any_department_type(auth.uid(), ARRAY['admin','super_admin','production','packing']))
  WITH CHECK (public.has_any_department_type(auth.uid(), ARRAY['admin','super_admin','production','packing']));
CREATE POLICY "Stock take team manages stock take lines" ON public.stock_take_lines FOR ALL TO authenticated
  USING (public.has_any_department_type(auth.uid(), ARRAY['admin','super_admin','production','packing']))
  WITH CHECK (public.has_any_department_type(auth.uid(), ARRAY['admin','super_admin','production','packing']));

CREATE OR REPLACE FUNCTION public.start_stock_take(p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM stock_takes WHERE status = 'counting') THEN
    RAISE EXCEPTION 'A stock take is already in progress';
  END IF;
  INSERT INTO stock_takes (notes) VALUES (p_notes) RETURNING id INTO v_id;
  INSERT INTO stock_take_lines (stock_take_id, material_lot_id, system_kg)
  SELECT v_id, id, COALESCE(available_kg,0) FROM material_lots WHERE COALESCE(available_kg,0) > 0;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.approve_stock_take(p_stock_take_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r record; n integer := 0;
BEGIN
  PERFORM 1 FROM stock_takes WHERE id = p_stock_take_id AND status = 'counting' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stock take not found or already approved'; END IF;
  IF EXISTS (SELECT 1 FROM stock_take_lines WHERE stock_take_id = p_stock_take_id AND physical_kg IS NULL) THEN
    RAISE EXCEPTION 'Enter the physical kg for every lot before approving';
  END IF;
  FOR r IN SELECT l.*, ml.heat_no FROM stock_take_lines l JOIN material_lots ml ON ml.id = l.material_lot_id
           WHERE l.stock_take_id = p_stock_take_id AND l.variance_kg <> 0 LOOP
    INSERT INTO inventory_movements (movement_type, quantity, quantity_kg, material_lot_id, heat_no, stock_take_id, created_by, notes)
    VALUES ('adjustment', 0, r.variance_kg, r.material_lot_id, r.heat_no, p_stock_take_id, auth.uid(), 'Stock take variance');
    -- apply variance so issues made during the count are preserved
    UPDATE material_lots SET available_kg = GREATEST(COALESCE(available_kg,0) + r.variance_kg, 0), updated_at = now()
     WHERE id = r.material_lot_id;
    n := n + 1;
  END LOOP;
  UPDATE stock_takes SET status = 'approved', approved_by = auth.uid(), approved_at = now() WHERE id = p_stock_take_id;
  RETURN n;
END $$;