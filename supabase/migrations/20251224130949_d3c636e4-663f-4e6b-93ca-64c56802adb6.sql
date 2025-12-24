
-- Add PAN number to customer_master
ALTER TABLE public.customer_master
ADD COLUMN IF NOT EXISTS pan_number TEXT,
ADD COLUMN IF NOT EXISTS is_export_customer BOOLEAN DEFAULT false;

-- Add PAN number to suppliers
ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS pan_number TEXT;

-- Create TDS records table for tracking
CREATE TABLE public.tds_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  record_type TEXT NOT NULL CHECK (record_type IN ('receivable', 'payable')),
  -- For receivables (customer TDS)
  customer_id UUID REFERENCES public.customer_master(id),
  receipt_id UUID REFERENCES public.customer_receipts(id),
  invoice_id UUID REFERENCES public.invoices(id),
  -- For payables (supplier TDS)
  supplier_id UUID REFERENCES public.suppliers(id),
  po_id UUID REFERENCES public.raw_material_po(id),
  -- Common fields
  pan_number TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- 'P' for proprietorship, 'C' for company, etc.
  tds_rate NUMERIC(5,2) NOT NULL, -- 1% or 2%
  gross_amount NUMERIC(14,2) NOT NULL,
  tds_amount NUMERIC(14,2) NOT NULL,
  net_amount NUMERIC(14,2) NOT NULL,
  financial_year TEXT NOT NULL,
  quarter TEXT NOT NULL, -- Q1, Q2, Q3, Q4
  transaction_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filed', 'paid')),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add TDS tracking columns to receipt_allocations
ALTER TABLE public.receipt_allocations
ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(14,2),
ADD COLUMN IF NOT EXISTS tds_amount NUMERIC(14,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_amount NUMERIC(14,2);

-- Enable RLS
ALTER TABLE public.tds_records ENABLE ROW LEVEL SECURITY;

-- RLS policies for tds_records
CREATE POLICY "Finance and admin can manage TDS records"
ON public.tds_records
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'accounts')
  )
);

-- Function to calculate TDS rate from PAN
CREATE OR REPLACE FUNCTION public.get_tds_rate(pan TEXT, is_export BOOLEAN DEFAULT false)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  entity_char CHAR(1);
BEGIN
  -- No TDS for export customers
  IF is_export THEN
    RETURN 0;
  END IF;
  
  -- Invalid PAN
  IF pan IS NULL OR LENGTH(pan) < 4 THEN
    RETURN 2; -- Default to higher rate if PAN invalid
  END IF;
  
  -- Get 4th character (entity type)
  entity_char := UPPER(SUBSTRING(pan FROM 4 FOR 1));
  
  -- P = Individual/Proprietorship = 1%
  -- Others (C=Company, F=Firm, H=HUF, etc.) = 2%
  IF entity_char = 'P' THEN
    RETURN 1;
  ELSE
    RETURN 2;
  END IF;
END;
$$;

-- Function to get entity type description from PAN
CREATE OR REPLACE FUNCTION public.get_pan_entity_type(pan TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  entity_char CHAR(1);
BEGIN
  IF pan IS NULL OR LENGTH(pan) < 4 THEN
    RETURN 'Unknown';
  END IF;
  
  entity_char := UPPER(SUBSTRING(pan FROM 4 FOR 1));
  
  RETURN CASE entity_char
    WHEN 'P' THEN 'Individual/Proprietorship'
    WHEN 'C' THEN 'Company'
    WHEN 'H' THEN 'HUF'
    WHEN 'F' THEN 'Firm'
    WHEN 'A' THEN 'AOP'
    WHEN 'T' THEN 'Trust'
    WHEN 'B' THEN 'BOI'
    WHEN 'L' THEN 'Local Authority'
    WHEN 'J' THEN 'Artificial Juridical Person'
    WHEN 'G' THEN 'Government'
    ELSE 'Other'
  END;
END;
$$;

-- Function to get financial year
CREATE OR REPLACE FUNCTION public.get_financial_year(dt DATE)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
BEGIN
  IF EXTRACT(MONTH FROM dt) >= 4 THEN
    RETURN EXTRACT(YEAR FROM dt)::TEXT || '-' || (EXTRACT(YEAR FROM dt) + 1)::TEXT;
  ELSE
    RETURN (EXTRACT(YEAR FROM dt) - 1)::TEXT || '-' || EXTRACT(YEAR FROM dt)::TEXT;
  END IF;
END;
$$;

-- Function to get quarter
CREATE OR REPLACE FUNCTION public.get_tds_quarter(dt DATE)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  month_num INT;
BEGIN
  month_num := EXTRACT(MONTH FROM dt);
  
  RETURN CASE
    WHEN month_num IN (4, 5, 6) THEN 'Q1'
    WHEN month_num IN (7, 8, 9) THEN 'Q2'
    WHEN month_num IN (10, 11, 12) THEN 'Q3'
    ELSE 'Q4'
  END;
END;
$$;

-- Trigger to update timestamps
CREATE TRIGGER update_tds_records_updated_at
BEFORE UPDATE ON public.tds_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for performance
CREATE INDEX idx_tds_records_customer ON public.tds_records(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_tds_records_supplier ON public.tds_records(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX idx_tds_records_fy_quarter ON public.tds_records(financial_year, quarter);
CREATE INDEX idx_tds_records_type ON public.tds_records(record_type);
