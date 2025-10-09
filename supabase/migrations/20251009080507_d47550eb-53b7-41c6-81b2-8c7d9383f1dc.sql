-- Finance and Logistics Schema Enhancement
-- This migration adds comprehensive finance (AR) and logistics tables

-- ========================================
-- ENUMS
-- ========================================

CREATE TYPE gst_type AS ENUM ('domestic', 'export', 'not_applicable');
CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'part_paid', 'paid', 'overdue', 'void');
CREATE TYPE payment_method AS ENUM ('bank_transfer', 'cheque', 'cash', 'upi', 'card', 'other');
CREATE TYPE followup_channel AS ENUM ('phone', 'email', 'whatsapp', 'in_person');
CREATE TYPE shipment_event_type AS ENUM ('label_created', 'picked', 'in_transit', 'out_for_delivery', 'delivered', 'exception');
CREATE TYPE sales_order_status AS ENUM ('draft', 'pending_approval', 'approved', 'invoiced', 'closed', 'cancelled');
CREATE TYPE recovery_stage AS ENUM ('none', 'friendly', 'firm', 'final_notice', 'hold_shipments', 'legal');

-- ========================================
-- UPDATE EXISTING TABLES
-- ========================================

-- Extend customers table
ALTER TABLE public.customer_master 
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS primary_contact_name TEXT,
ADD COLUMN IF NOT EXISTS primary_contact_email TEXT,
ADD COLUMN IF NOT EXISTS primary_contact_phone TEXT,
ADD COLUMN IF NOT EXISTS gst_number TEXT,
ADD COLUMN IF NOT EXISTS gst_type gst_type DEFAULT 'not_applicable',
ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS credit_limit_currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS credit_limit_amount NUMERIC(14,2);

-- Extend sales_orders table
ALTER TABLE public.sales_orders
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS price_per_pc NUMERIC(12,4),
ADD COLUMN IF NOT EXISTS line_level_pricing BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS drawing_number TEXT,
ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
ADD COLUMN IF NOT EXISTS incoterm TEXT,
ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER,
ADD COLUMN IF NOT EXISTS tax_profile_id UUID,
ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2),
ADD COLUMN IF NOT EXISTS status sales_order_status DEFAULT 'draft';

-- Extend work_orders table for financial data hiding
ALTER TABLE public.work_orders
ADD COLUMN IF NOT EXISTS financial_snapshot JSONB,
ADD COLUMN IF NOT EXISTS hidden_financial BOOLEAN DEFAULT true;

-- Extend shipments table
ALTER TABLE public.shipments
ADD COLUMN IF NOT EXISTS so_id UUID REFERENCES public.sales_orders(id),
ADD COLUMN IF NOT EXISTS wo_id UUID REFERENCES public.work_orders(id),
ADD COLUMN IF NOT EXISTS carrier TEXT,
ADD COLUMN IF NOT EXISTS transporter_name TEXT,
ADD COLUMN IF NOT EXISTS lr_no TEXT,
ADD COLUMN IF NOT EXISTS delivered_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS ship_to_address JSONB,
ADD COLUMN IF NOT EXISTS boxes INTEGER,
ADD COLUMN IF NOT EXISTS gross_weight_kg NUMERIC(12,3),
ADD COLUMN IF NOT EXISTS net_weight_kg NUMERIC(12,3),
ADD COLUMN IF NOT EXISTS documents JSONB;

-- ========================================
-- CREATE NEW TABLES
-- ========================================

-- Sales Order Line Items
CREATE TABLE IF NOT EXISTS public.sales_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  item_code TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  net_weight_per_pc_g NUMERIC(10,2),
  gross_weight_per_pc_g NUMERIC(10,2),
  price_per_pc NUMERIC(12,4),
  line_amount NUMERIC(14,2),
  alloy TEXT,
  material_size TEXT,
  drawing_number TEXT,
  due_date DATE,
  work_order_id UUID REFERENCES public.work_orders(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(sales_order_id, line_number)
);

-- Invoices
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no TEXT UNIQUE NOT NULL,
  so_id UUID REFERENCES public.sales_orders(id),
  wo_id UUID REFERENCES public.work_orders(id),
  customer_id UUID REFERENCES public.customer_master(id) NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  currency TEXT DEFAULT 'USD',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  gst_percent NUMERIC(5,2) DEFAULT 0,
  gst_amount NUMERIC(14,2) DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14,2) DEFAULT 0,
  balance_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status invoice_status DEFAULT 'draft',
  payment_terms_days INTEGER,
  pdf_url TEXT,
  expected_payment_date DATE,
  recovery_stage recovery_stage DEFAULT 'none',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Invoice Line Items
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  so_item_id UUID REFERENCES public.sales_order_items(id),
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL,
  rate NUMERIC(12,4) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  gst_percent NUMERIC(5,2) DEFAULT 0,
  gst_amount NUMERIC(14,2) DEFAULT 0,
  total_line NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Payments
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14,2) NOT NULL,
  method payment_method DEFAULT 'bank_transfer',
  reference TEXT,
  notes TEXT,
  received_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- AR Follow-ups
CREATE TABLE IF NOT EXISTS public.ar_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id),
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  channel followup_channel DEFAULT 'email',
  followup_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  next_followup_date DATE,
  outcome TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Shipment Events
CREATE TABLE IF NOT EXISTS public.shipment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  event_time TIMESTAMP WITH TIME ZONE DEFAULT now(),
  event_type shipment_event_type NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ========================================
-- INDEXES
-- ========================================

CREATE INDEX IF NOT EXISTS idx_invoices_due_date_status ON public.invoices(due_date, status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_expected_payment_date ON public.invoices(expected_payment_date) WHERE status IN ('issued', 'part_paid', 'overdue');
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ar_followups_invoice_id ON public.ar_followups(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ar_followups_next_followup ON public.ar_followups(next_followup_date) WHERE next_followup_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_wo_id ON public.shipments(wo_id);
CREATE INDEX IF NOT EXISTS idx_shipments_lr_no ON public.shipments(lr_no);
CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment_id ON public.shipment_events(shipment_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_so_id ON public.sales_order_items(sales_order_id);

-- ========================================
-- RLS POLICIES
-- ========================================

-- Sales Order Items
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view sales order items"
  ON public.sales_order_items FOR SELECT
  USING (true);

CREATE POLICY "Sales and admin can manage sales order items"
  ON public.sales_order_items FOR ALL
  USING (has_role(auth.uid(), 'sales') OR has_role(auth.uid(), 'admin'));

-- Invoices
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view invoices"
  ON public.invoices FOR SELECT
  USING (true);

CREATE POLICY "Accounts and admin can manage invoices"
  ON public.invoices FOR ALL
  USING (has_role(auth.uid(), 'accounts') OR has_role(auth.uid(), 'admin'));

-- Invoice Items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view invoice items"
  ON public.invoice_items FOR SELECT
  USING (true);

CREATE POLICY "Accounts and admin can manage invoice items"
  ON public.invoice_items FOR ALL
  USING (has_role(auth.uid(), 'accounts') OR has_role(auth.uid(), 'admin'));

-- Payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view payments"
  ON public.payments FOR SELECT
  USING (true);

CREATE POLICY "Accounts and admin can manage payments"
  ON public.payments FOR ALL
  USING (has_role(auth.uid(), 'accounts') OR has_role(auth.uid(), 'admin'));

-- AR Follow-ups
ALTER TABLE public.ar_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view follow-ups"
  ON public.ar_followups FOR SELECT
  USING (true);

CREATE POLICY "Accounts and admin can manage follow-ups"
  ON public.ar_followups FOR ALL
  USING (has_role(auth.uid(), 'accounts') OR has_role(auth.uid(), 'admin'));

-- Shipment Events
ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view shipment events"
  ON public.shipment_events FOR SELECT
  USING (true);

CREATE POLICY "Packing and admin can manage shipment events"
  ON public.shipment_events FOR ALL
  USING (has_role(auth.uid(), 'packing') OR has_role(auth.uid(), 'admin'));

-- ========================================
-- FUNCTIONS & TRIGGERS
-- ========================================

-- Update invoice balance on payment
CREATE OR REPLACE FUNCTION update_invoice_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_paid NUMERIC(14,2);
  invoice_total NUMERIC(14,2);
BEGIN
  -- Calculate total paid
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM public.payments
  WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  -- Get invoice total
  SELECT total_amount INTO invoice_total
  FROM public.invoices
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  -- Update invoice
  UPDATE public.invoices
  SET 
    paid_amount = total_paid,
    balance_amount = invoice_total - total_paid,
    status = CASE
      WHEN total_paid >= invoice_total THEN 'paid'::invoice_status
      WHEN total_paid > 0 THEN 'part_paid'::invoice_status
      ELSE status
    END,
    updated_at = now()
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER payment_update_invoice
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_on_payment();

-- Auto-update overdue invoices
CREATE OR REPLACE FUNCTION mark_overdue_invoices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.invoices
  SET status = 'overdue'::invoice_status
  WHERE due_date < CURRENT_DATE
    AND balance_amount > 0
    AND status IN ('issued'::invoice_status, 'part_paid'::invoice_status);
END;
$$;

-- Trigger to update invoice balance on invoice item changes
CREATE OR REPLACE FUNCTION calculate_invoice_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  calc_subtotal NUMERIC(14,2);
  calc_gst NUMERIC(14,2);
  calc_total NUMERIC(14,2);
  invoice_gst_percent NUMERIC(5,2);
BEGIN
  -- Get invoice GST percentage
  SELECT gst_percent INTO invoice_gst_percent
  FROM public.invoices
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  -- Calculate totals
  SELECT 
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(gst_amount), 0),
    COALESCE(SUM(total_line), 0)
  INTO calc_subtotal, calc_gst, calc_total
  FROM public.invoice_items
  WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  -- Update invoice
  UPDATE public.invoices
  SET 
    subtotal = calc_subtotal,
    gst_amount = calc_gst,
    total_amount = calc_total,
    balance_amount = calc_total - COALESCE(paid_amount, 0),
    updated_at = now()
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER invoice_items_update_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_invoice_totals();

-- Update triggers for timestamps
CREATE TRIGGER update_sales_order_items_updated_at
  BEFORE UPDATE ON public.sales_order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();