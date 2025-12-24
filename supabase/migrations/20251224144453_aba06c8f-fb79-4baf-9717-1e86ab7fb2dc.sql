-- Create supplier_payments table for recording payments to suppliers
CREATE TABLE public.supplier_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
  reference_no TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add tds_rate column to suppliers table
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS tds_rate NUMERIC(5,2) DEFAULT 0;

-- Enable RLS
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for supplier_payments (using valid app_role values)
CREATE POLICY "Users can view supplier payments"
  ON public.supplier_payments FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'));

CREATE POLICY "Users can insert supplier payments"
  ON public.supplier_payments FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'));

CREATE POLICY "Users can update supplier payments"
  ON public.supplier_payments FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'));

-- Trigger for updated_at
CREATE TRIGGER update_supplier_payments_updated_at
  BEFORE UPDATE ON public.supplier_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();