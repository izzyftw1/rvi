-- Create raw_material_po table for new procurement flow
CREATE TABLE IF NOT EXISTS public.raw_material_po (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id TEXT NOT NULL UNIQUE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  material_grade TEXT NOT NULL,
  alloy TEXT NOT NULL,
  qty_kg NUMERIC NOT NULL,
  rate_per_kg NUMERIC NOT NULL,
  total_value NUMERIC GENERATED ALWAYS AS (qty_kg * rate_per_kg) STORED,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partially_received', 'completed', 'cancelled')),
  linked_wo_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  linked_requirement_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_date DATE NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  remarks TEXT
);

-- Create GRN (Goods Receipt Note) table
CREATE TABLE IF NOT EXISTS public.grn_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_no TEXT NOT NULL UNIQUE,
  po_id UUID REFERENCES public.raw_material_po(id) ON DELETE CASCADE,
  received_qty_kg NUMERIC NOT NULL,
  lot_number TEXT NOT NULL,
  supplier_batch_ref TEXT,
  material_grade TEXT NOT NULL,
  alloy TEXT NOT NULL,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  remarks TEXT
);

-- Enable RLS
ALTER TABLE public.raw_material_po ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grn_receipts ENABLE ROW LEVEL SECURITY;

-- RLS policies for raw_material_po
CREATE POLICY "Everyone can view raw material POs"
  ON public.raw_material_po FOR SELECT
  USING (true);

CREATE POLICY "Purchase and admin can create POs"
  ON public.raw_material_po FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'purchase'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Purchase and admin can update POs"
  ON public.raw_material_po FOR UPDATE
  USING (has_role(auth.uid(), 'purchase'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for grn_receipts
CREATE POLICY "Everyone can view GRN receipts"
  ON public.grn_receipts FOR SELECT
  USING (true);

CREATE POLICY "Stores and admin can create GRN"
  ON public.grn_receipts FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'stores'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create indexes
CREATE INDEX idx_raw_material_po_supplier ON public.raw_material_po(supplier_id);
CREATE INDEX idx_raw_material_po_material_grade ON public.raw_material_po(material_grade);
CREATE INDEX idx_raw_material_po_status ON public.raw_material_po(status);
CREATE INDEX idx_grn_receipts_po_id ON public.grn_receipts(po_id);

-- Trigger to update updated_at
CREATE TRIGGER update_raw_material_po_updated_at
  BEFORE UPDATE ON public.raw_material_po
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to generate PO number
CREATE OR REPLACE FUNCTION public.generate_raw_po_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_number INTEGER;
  year_suffix TEXT;
BEGIN
  year_suffix := TO_CHAR(CURRENT_DATE, 'YY');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(po_id FROM 'RPO-(\d+)-') AS INTEGER)), 0) + 1
  INTO next_number
  FROM raw_material_po
  WHERE po_id LIKE 'RPO-%-' || year_suffix;
  
  RETURN 'RPO-' || LPAD(next_number::TEXT, 5, '0') || '-' || year_suffix;
END;
$$;

-- Function to generate GRN number
CREATE OR REPLACE FUNCTION public.generate_grn_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_number INTEGER;
  year_suffix TEXT;
BEGIN
  year_suffix := TO_CHAR(CURRENT_DATE, 'YY');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(grn_no FROM 'GRN-(\d+)-') AS INTEGER)), 0) + 1
  INTO next_number
  FROM grn_receipts
  WHERE grn_no LIKE 'GRN-%-' || year_suffix;
  
  RETURN 'GRN-' || LPAD(next_number::TEXT, 5, '0') || '-' || year_suffix;
END;
$$;

-- Function to update material requirements status when PO is created
CREATE OR REPLACE FUNCTION public.update_material_req_on_po_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update linked material requirements to 'ordered' status
  IF NEW.linked_requirement_ids IS NOT NULL THEN
    UPDATE public.material_requirements_v2
    SET status = 'ordered',
        updated_at = now()
    WHERE id = ANY(
      SELECT jsonb_array_elements_text(NEW.linked_requirement_ids)::uuid
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_material_req_on_po_create_trigger
  AFTER INSERT ON public.raw_material_po
  FOR EACH ROW
  EXECUTE FUNCTION public.update_material_req_on_po_create();

-- Function to update PO status and inventory when GRN is created
CREATE OR REPLACE FUNCTION public.process_grn_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po_record RECORD;
  total_received NUMERIC;
  new_lot_id TEXT;
BEGIN
  -- Get PO details
  SELECT * INTO po_record FROM public.raw_material_po WHERE id = NEW.po_id;
  
  -- Calculate total received for this PO
  SELECT COALESCE(SUM(received_qty_kg), 0) INTO total_received
  FROM public.grn_receipts
  WHERE po_id = NEW.po_id;
  
  -- Update PO status based on received quantity
  UPDATE public.raw_material_po
  SET 
    status = CASE
      WHEN total_received >= qty_kg THEN 'completed'
      WHEN total_received > 0 THEN 'partially_received'
      ELSE status
    END,
    updated_at = now()
  WHERE id = NEW.po_id;
  
  -- Create inventory lot entry
  INSERT INTO public.material_lots (
    lot_id,
    heat_no,
    alloy,
    material_size_mm,
    gross_weight,
    net_weight,
    received_date,
    supplier,
    po_id,
    status,
    qc_status
  )
  VALUES (
    NEW.lot_number,
    NEW.supplier_batch_ref,
    NEW.alloy,
    NEW.material_grade,
    NEW.received_qty_kg,
    NEW.received_qty_kg,
    NEW.received_date,
    (SELECT name FROM public.suppliers WHERE id = po_record.supplier_id),
    NEW.po_id,
    'received',
    'pending'
  );
  
  -- Update material requirements status if fully received
  IF total_received >= po_record.qty_kg THEN
    UPDATE public.material_requirements_v2
    SET 
      status = 'fulfilled',
      updated_at = now()
    WHERE id = ANY(
      SELECT jsonb_array_elements_text(po_record.linked_requirement_ids)::uuid
    );
  ELSE
    -- Mark as partial
    UPDATE public.material_requirements_v2
    SET 
      status = 'partial',
      updated_at = now()
    WHERE id = ANY(
      SELECT jsonb_array_elements_text(po_record.linked_requirement_ids)::uuid
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER process_grn_receipt_trigger
  AFTER INSERT ON public.grn_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.process_grn_receipt();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.raw_material_po;
ALTER PUBLICATION supabase_realtime ADD TABLE public.grn_receipts;