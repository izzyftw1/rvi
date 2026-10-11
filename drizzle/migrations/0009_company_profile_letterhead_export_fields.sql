ALTER TABLE public.finance_settings
  ADD COLUMN IF NOT EXISTS company_name text NOT NULL DEFAULT 'R. V. Industries',
  ADD COLUMN IF NOT EXISTS company_address text NOT NULL DEFAULT 'Plot No. 11, 12/1 & 12/2, Near Prime Int''l School, Sadguru Industrial Area, Kansumara Main Road, Jamnagar 361006, Gujarat, India',
  ADD COLUMN IF NOT EXISTS company_phones text NOT NULL DEFAULT '+91 9427420088, +91 2882564431',
  ADD COLUMN IF NOT EXISTS company_email text NOT NULL DEFAULT 'sales@brasspartsindia.net',
  ADD COLUMN IF NOT EXISTS company_website text NOT NULL DEFAULT 'www.brasspartsindia.net',
  ADD COLUMN IF NOT EXISTS company_gstin text NOT NULL DEFAULT '24ADJPV2931R1ZU',
  ADD COLUMN IF NOT EXISTS company_iec text NOT NULL DEFAULT '2416502204',
  ADD COLUMN IF NOT EXISTS company_udyam text NOT NULL DEFAULT 'UDYAM-GJ-10-0002536',
  ADD COLUMN IF NOT EXISTS signatory_designation text NOT NULL DEFAULT 'Proprietor',
  ADD COLUMN IF NOT EXISTS lut_arn text;

ALTER TABLE public.customer_master
  ADD COLUMN IF NOT EXISTS eori_number text,
  ADD COLUMN IF NOT EXISTS default_marks_numbers text;

ALTER TABLE public.item_master
  ADD COLUMN IF NOT EXISTS hs_code text,
  ADD COLUMN IF NOT EXISTS goods_heading text;

ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
UPDATE public.material_lots SET is_archived = true, available_kg = 0
 WHERE id IN ('0cb6024a-69cc-451d-81b0-8f47746599ea','f564c238-dd27-460b-b1f5-adad39ac7deb','61802350-0a93-4263-bbf1-5d41ef9efe51');

CREATE OR REPLACE FUNCTION public.start_stock_take(p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM stock_takes WHERE status = 'counting') THEN
    RAISE EXCEPTION 'A stock take is already in progress';
  END IF;
  INSERT INTO stock_takes (notes) VALUES (p_notes) RETURNING id INTO v_id;
  INSERT INTO stock_take_lines (stock_take_id, material_lot_id, system_kg)
  SELECT v_id, id, COALESCE(available_kg,0) FROM material_lots
   WHERE COALESCE(available_kg,0) > 0 AND NOT is_archived;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.block_archived_lot_issue()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM material_lots WHERE id = NEW.lot_id AND is_archived) THEN
    RAISE EXCEPTION 'This material lot is archived and cannot be issued';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_block_archived_lot_issue ON public.wo_material_issues;
CREATE TRIGGER trg_block_archived_lot_issue BEFORE INSERT ON public.wo_material_issues
FOR EACH ROW EXECUTE FUNCTION public.block_archived_lot_issue();

-- Branding bucket: any signed-in user can read, admins manage
CREATE POLICY "Authenticated can read branding" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'branding');
CREATE POLICY "Admins can upload branding" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND public.has_any_department_type(auth.uid(), ARRAY['admin','super_admin']));
CREATE POLICY "Admins can update branding" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND public.has_any_department_type(auth.uid(), ARRAY['admin','super_admin']));
CREATE POLICY "Admins can delete branding" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND public.has_any_department_type(auth.uid(), ARRAY['admin','super_admin']));