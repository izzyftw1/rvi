-- Create customer_receipts table for bank receipts
CREATE TABLE public.customer_receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_no TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customer_master(id),
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount NUMERIC NOT NULL,
  allocated_amount NUMERIC NOT NULL DEFAULT 0,
  unallocated_amount NUMERIC GENERATED ALWAYS AS (total_amount - allocated_amount) STORED,
  payment_method payment_method NOT NULL DEFAULT 'bank_transfer',
  bank_reference TEXT,
  bank_name TEXT,
  currency TEXT DEFAULT 'USD',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partially_allocated', 'fully_allocated', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- Create receipt_allocations table for linking receipts to invoices
CREATE TABLE public.receipt_allocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_id UUID NOT NULL REFERENCES public.customer_receipts(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id),
  allocated_amount NUMERIC NOT NULL CHECK (allocated_amount > 0),
  allocation_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  allocated_by UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique index to prevent duplicate allocations
CREATE UNIQUE INDEX idx_receipt_allocations_unique ON public.receipt_allocations(receipt_id, invoice_id);

-- Enable RLS
ALTER TABLE public.customer_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_allocations ENABLE ROW LEVEL SECURITY;

-- RLS policies for customer_receipts
CREATE POLICY "Finance roles can view receipts"
  ON public.customer_receipts FOR SELECT
  USING (
    has_role(auth.uid(), 'accounts'::app_role) OR 
    has_role(auth.uid(), 'finance_admin'::app_role) OR 
    has_role(auth.uid(), 'finance_user'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Accounts and admin can manage receipts"
  ON public.customer_receipts FOR ALL
  USING (
    has_role(auth.uid(), 'accounts'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

-- RLS policies for receipt_allocations
CREATE POLICY "Finance roles can view allocations"
  ON public.receipt_allocations FOR SELECT
  USING (
    has_role(auth.uid(), 'accounts'::app_role) OR 
    has_role(auth.uid(), 'finance_admin'::app_role) OR 
    has_role(auth.uid(), 'finance_user'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Accounts and admin can manage allocations"
  ON public.receipt_allocations FOR ALL
  USING (
    has_role(auth.uid(), 'accounts'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

-- Function to update receipt status based on allocations
CREATE OR REPLACE FUNCTION public.update_receipt_status()
RETURNS TRIGGER AS $$
DECLARE
  v_total NUMERIC;
  v_allocated NUMERIC;
BEGIN
  -- Get receipt totals
  SELECT total_amount INTO v_total FROM public.customer_receipts WHERE id = COALESCE(NEW.receipt_id, OLD.receipt_id);
  SELECT COALESCE(SUM(allocated_amount), 0) INTO v_allocated FROM public.receipt_allocations WHERE receipt_id = COALESCE(NEW.receipt_id, OLD.receipt_id);
  
  -- Update receipt allocated amount and status
  UPDATE public.customer_receipts
  SET 
    allocated_amount = v_allocated,
    status = CASE 
      WHEN v_allocated = 0 THEN 'pending'
      WHEN v_allocated < v_total THEN 'partially_allocated'
      ELSE 'fully_allocated'
    END,
    updated_at = now()
  WHERE id = COALESCE(NEW.receipt_id, OLD.receipt_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to update receipt status on allocation changes
CREATE TRIGGER trg_update_receipt_status
AFTER INSERT OR UPDATE OR DELETE ON public.receipt_allocations
FOR EACH ROW EXECUTE FUNCTION public.update_receipt_status();

-- Function to update invoice paid amounts from allocations
CREATE OR REPLACE FUNCTION public.update_invoice_from_allocation()
RETURNS TRIGGER AS $$
DECLARE
  v_total_allocated NUMERIC;
  v_invoice_total NUMERIC;
BEGIN
  -- Get total allocations for the invoice
  SELECT COALESCE(SUM(allocated_amount), 0) INTO v_total_allocated 
  FROM public.receipt_allocations 
  WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  -- Get invoice total
  SELECT total_amount INTO v_invoice_total 
  FROM public.invoices 
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  -- Update invoice paid_amount and balance
  UPDATE public.invoices
  SET 
    paid_amount = v_total_allocated,
    balance_amount = total_amount - v_total_allocated,
    status = CASE 
      WHEN v_total_allocated = 0 THEN 'issued'
      WHEN v_total_allocated < v_invoice_total THEN 'part_paid'
      ELSE 'paid'
    END,
    updated_at = now()
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to update invoice on allocation changes
CREATE TRIGGER trg_update_invoice_from_allocation
AFTER INSERT OR UPDATE OR DELETE ON public.receipt_allocations
FOR EACH ROW EXECUTE FUNCTION public.update_invoice_from_allocation();

-- Create indexes for performance
CREATE INDEX idx_customer_receipts_customer ON public.customer_receipts(customer_id);
CREATE INDEX idx_customer_receipts_date ON public.customer_receipts(receipt_date);
CREATE INDEX idx_customer_receipts_status ON public.customer_receipts(status);
CREATE INDEX idx_receipt_allocations_receipt ON public.receipt_allocations(receipt_id);
CREATE INDEX idx_receipt_allocations_invoice ON public.receipt_allocations(invoice_id);