-- Create suppliers table
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  gst_number TEXT,
  currency TEXT DEFAULT 'INR',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create enum for RPO status
CREATE TYPE public.rpo_status AS ENUM (
  'draft',
  'pending_approval',
  'approved',
  'part_received',
  'closed',
  'cancelled'
);

-- Create raw_purchase_orders table
CREATE TABLE IF NOT EXISTS public.raw_purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rpo_no TEXT UNIQUE NOT NULL,
  status rpo_status NOT NULL DEFAULT 'draft',
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  created_by UUID REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  so_id UUID REFERENCES public.sales_orders(id),
  wo_id UUID REFERENCES public.work_orders(id),
  item_code TEXT,
  material_size_mm TEXT,
  alloy TEXT,
  qty_ordered_kg NUMERIC(12,3) NOT NULL,
  rate_per_kg NUMERIC(12,3) NOT NULL,
  amount_ordered NUMERIC(14,2) NOT NULL,
  remarks TEXT,
  expected_delivery_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ
);

-- Create raw_po_receipts table
CREATE TABLE IF NOT EXISTS public.raw_po_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rpo_id UUID NOT NULL REFERENCES public.raw_purchase_orders(id) ON DELETE CASCADE,
  gi_ref UUID REFERENCES public.material_lots(id),
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  qty_received_kg NUMERIC(12,3) NOT NULL,
  supplier_invoice_no TEXT,
  supplier_invoice_date DATE,
  rate_on_invoice NUMERIC(12,3),
  amount_on_invoice NUMERIC(14,2),
  lr_no TEXT,
  transporter TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create enums for reconciliation
CREATE TYPE public.reconciliation_reason AS ENUM (
  'short_supply',
  'excess_supply',
  'rate_variance',
  'other'
);

CREATE TYPE public.reconciliation_resolution AS ENUM (
  'credit_note',
  'debit_note',
  'price_adjustment',
  'pending'
);

-- Create raw_po_reconciliations table
CREATE TABLE IF NOT EXISTS public.raw_po_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rpo_id UUID NOT NULL REFERENCES public.raw_purchase_orders(id) ON DELETE CASCADE,
  qty_delta_kg NUMERIC(12,3),
  rate_delta NUMERIC(12,3),
  amount_delta NUMERIC(14,2),
  reason reconciliation_reason NOT NULL,
  resolution reconciliation_resolution NOT NULL DEFAULT 'pending',
  resolution_ref TEXT,
  resolved_by UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create inventory_lots table (separate from material_lots for procurement tracking)
CREATE TABLE IF NOT EXISTS public.inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id TEXT UNIQUE NOT NULL,
  material_size_mm TEXT NOT NULL,
  alloy TEXT NOT NULL,
  qty_kg NUMERIC(12,3) NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id),
  rpo_id UUID REFERENCES public.raw_purchase_orders(id),
  heat_no TEXT,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  cost_rate NUMERIC(12,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_raw_purchase_orders_wo_id_status 
  ON public.raw_purchase_orders(wo_id, status);

CREATE INDEX IF NOT EXISTS idx_raw_po_receipts_rpo_id 
  ON public.raw_po_receipts(rpo_id);

CREATE INDEX IF NOT EXISTS idx_inventory_lots_material_alloy 
  ON public.inventory_lots(material_size_mm, alloy);

CREATE INDEX IF NOT EXISTS idx_raw_purchase_orders_supplier 
  ON public.raw_purchase_orders(supplier_id);

CREATE INDEX IF NOT EXISTS idx_inventory_lots_supplier 
  ON public.inventory_lots(supplier_id);

-- Add triggers for updated_at
CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_raw_purchase_orders_updated_at
  BEFORE UPDATE ON public.raw_purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inventory_lots_updated_at
  BEFORE UPDATE ON public.inventory_lots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on all tables
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_po_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_po_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;

-- RLS Policies for suppliers
CREATE POLICY "Authenticated users can view suppliers"
  ON public.suppliers FOR SELECT
  USING (true);

CREATE POLICY "Purchase and admin can manage suppliers"
  ON public.suppliers FOR ALL
  USING (has_role(auth.uid(), 'purchase'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'purchase'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for raw_purchase_orders
CREATE POLICY "Authenticated users can view RPOs"
  ON public.raw_purchase_orders FOR SELECT
  USING (true);

CREATE POLICY "Purchase can create RPOs"
  ON public.raw_purchase_orders FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'purchase'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Purchase and admin can update RPOs"
  ON public.raw_purchase_orders FOR UPDATE
  USING (has_role(auth.uid(), 'purchase'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'purchase'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for raw_po_receipts
CREATE POLICY "Authenticated users can view receipts"
  ON public.raw_po_receipts FOR SELECT
  USING (true);

CREATE POLICY "Stores and purchase can manage receipts"
  ON public.raw_po_receipts FOR ALL
  USING (has_role(auth.uid(), 'stores'::app_role) OR has_role(auth.uid(), 'purchase'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'stores'::app_role) OR has_role(auth.uid(), 'purchase'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for raw_po_reconciliations
CREATE POLICY "Authenticated users can view reconciliations"
  ON public.raw_po_reconciliations FOR SELECT
  USING (true);

CREATE POLICY "Purchase and admin can manage reconciliations"
  ON public.raw_po_reconciliations FOR ALL
  USING (has_role(auth.uid(), 'purchase'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'purchase'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for inventory_lots
CREATE POLICY "Authenticated users can view inventory lots"
  ON public.inventory_lots FOR SELECT
  USING (true);

CREATE POLICY "Stores and purchase can manage inventory lots"
  ON public.inventory_lots FOR ALL
  USING (has_role(auth.uid(), 'stores'::app_role) OR has_role(auth.uid(), 'purchase'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'stores'::app_role) OR has_role(auth.uid(), 'purchase'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Function to auto-generate RPO number
CREATE OR REPLACE FUNCTION public.generate_rpo_number()
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
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(rpo_no FROM 'RPO-(\d+)-') AS INTEGER)), 0) + 1
  INTO next_number
  FROM raw_purchase_orders
  WHERE rpo_no LIKE 'RPO-%-' || year_suffix;
  
  RETURN 'RPO-' || LPAD(next_number::TEXT, 5, '0') || '-' || year_suffix;
END;
$$;