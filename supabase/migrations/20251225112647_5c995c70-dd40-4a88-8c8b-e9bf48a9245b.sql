-- ADDITIVE ONLY: Extend proforma_invoices table with new columns for enhanced proforma generation
-- This preserves all existing data and columns

-- Add customer details columns
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customer_master(id);
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS customer_contact TEXT;
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS customer_gst TEXT;

-- Add PO reference columns
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS po_number TEXT;
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS po_date DATE;

-- Add line items (structured storage)
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS line_items JSONB DEFAULT '[]'::jsonb;

-- Add totals columns
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14,2) DEFAULT 0;
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS gst_percent NUMERIC(5,2) DEFAULT 0;
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';

-- Add payment terms columns
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS advance_percent NUMERIC(5,2) DEFAULT 0;
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS balance_terms TEXT;

-- Add export vs domestic columns
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS is_export BOOLEAN DEFAULT false;
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS incoterm TEXT;
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS port_of_loading TEXT;
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS port_of_discharge TEXT;
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS country_of_origin TEXT DEFAULT 'India';
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS hs_code TEXT;

-- Add metadata columns
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS validity_days INTEGER DEFAULT 30;
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';

-- Create function to generate proforma invoice number if not exists
CREATE OR REPLACE FUNCTION public.generate_proforma_number()
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
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(proforma_no FROM 'PI-(\d+)-') AS INTEGER)), 0) + 1
  INTO next_number
  FROM proforma_invoices
  WHERE proforma_no LIKE 'PI-%-' || year_suffix;
  
  RETURN 'PI-' || LPAD(next_number::TEXT, 5, '0') || '-' || year_suffix;
END;
$$;

-- Create indexes for faster lookups (IF NOT EXISTS is not supported for indexes, so we use DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_proforma_invoices_customer_id') THEN
    CREATE INDEX idx_proforma_invoices_customer_id ON public.proforma_invoices(customer_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_proforma_invoices_status') THEN
    CREATE INDEX idx_proforma_invoices_status ON public.proforma_invoices(status);
  END IF;
END $$;