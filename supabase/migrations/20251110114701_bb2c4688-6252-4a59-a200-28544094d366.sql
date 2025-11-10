-- Create storage bucket for proforma invoices
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'proforma-invoices',
  'proforma-invoices',
  false,
  5242880,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for proforma-invoices bucket
CREATE POLICY "Authenticated users can view proforma invoices"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'proforma-invoices' AND auth.role() = 'authenticated');

CREATE POLICY "Sales and admin can upload proforma invoices"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'proforma-invoices' 
    AND auth.role() = 'authenticated'
    AND (
      has_role(auth.uid(), 'sales'::app_role) 
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "Sales and admin can delete proforma invoices"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'proforma-invoices' 
    AND (
      has_role(auth.uid(), 'sales'::app_role) 
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- Create table to track generated proforma invoices
CREATE TABLE IF NOT EXISTS public.proforma_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  proforma_no TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT,
  generated_by UUID REFERENCES auth.users(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_to_email TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.proforma_invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies for proforma_invoices
CREATE POLICY "Everyone can view proforma invoices"
  ON public.proforma_invoices FOR SELECT
  USING (true);

CREATE POLICY "Sales and admin can manage proforma invoices"
  ON public.proforma_invoices FOR ALL
  USING (
    has_role(auth.uid(), 'sales'::app_role) 
    OR has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'sales'::app_role) 
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_proforma_invoices_sales_order 
  ON public.proforma_invoices(sales_order_id);

COMMENT ON TABLE public.proforma_invoices IS 'Stores metadata for generated proforma invoice PDFs';