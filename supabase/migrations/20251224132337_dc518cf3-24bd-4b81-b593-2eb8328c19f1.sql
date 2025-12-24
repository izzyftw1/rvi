-- Create customer_credit_adjustments table for tracking rejection-based credits
CREATE TABLE public.customer_credit_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customer_master(id),
  source_invoice_id UUID REFERENCES public.invoices(id),
  ncr_id UUID REFERENCES public.ncrs(id),
  adjustment_type TEXT NOT NULL DEFAULT 'rejection' CHECK (adjustment_type IN ('rejection', 'quality_claim', 'price_dispute', 'other')),
  original_amount NUMERIC(14,2) NOT NULL,
  remaining_amount NUMERIC(14,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  reason TEXT NOT NULL,
  rejection_qty INTEGER,
  unit_rate NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'applied', 'cancelled', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  notes TEXT
);

-- Create invoice_adjustments table for tracking adjustments applied to invoices
CREATE TABLE public.invoice_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  credit_adjustment_id UUID NOT NULL REFERENCES public.customer_credit_adjustments(id),
  amount NUMERIC(14,2) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by UUID,
  notes TEXT
);

-- Add columns to invoices table for adjustment tracking
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(14,2) GENERATED ALWAYS AS (subtotal + COALESCE(gst_amount, 0)) STORED,
ADD COLUMN IF NOT EXISTS adjustment_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_payable NUMERIC(14,2) GENERATED ALWAYS AS (total_amount - adjustment_amount) STORED,
ADD COLUMN IF NOT EXISTS short_closed BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS short_close_reason TEXT,
ADD COLUMN IF NOT EXISTS short_closed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS short_closed_by UUID;

-- Add new invoice status for short closed
DO $$ 
BEGIN
  -- Check if invoice_status enum exists and add value if not present
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e 
    JOIN pg_type t ON e.enumtypid = t.oid 
    WHERE t.typname = 'invoice_status' AND e.enumlabel = 'short_closed'
  ) THEN
    ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'short_closed';
  END IF;
END $$;

-- Enable RLS on new tables
ALTER TABLE public.customer_credit_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_adjustments ENABLE ROW LEVEL SECURITY;

-- RLS policies for customer_credit_adjustments
CREATE POLICY "Authenticated users can view credit adjustments"
  ON public.customer_credit_adjustments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create credit adjustments"
  ON public.customer_credit_adjustments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update credit adjustments"
  ON public.customer_credit_adjustments
  FOR UPDATE
  TO authenticated
  USING (true);

-- RLS policies for invoice_adjustments
CREATE POLICY "Authenticated users can view invoice adjustments"
  ON public.invoice_adjustments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create invoice adjustments"
  ON public.invoice_adjustments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create trigger to update remaining_amount when adjustments are applied
CREATE OR REPLACE FUNCTION public.update_credit_adjustment_remaining()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_total_applied NUMERIC(14,2);
  v_original_amount NUMERIC(14,2);
BEGIN
  -- Calculate total applied from this credit adjustment
  SELECT COALESCE(SUM(amount), 0) INTO v_total_applied
  FROM invoice_adjustments
  WHERE credit_adjustment_id = COALESCE(NEW.credit_adjustment_id, OLD.credit_adjustment_id);
  
  -- Get original amount
  SELECT original_amount INTO v_original_amount
  FROM customer_credit_adjustments
  WHERE id = COALESCE(NEW.credit_adjustment_id, OLD.credit_adjustment_id);
  
  -- Update remaining amount and status
  UPDATE customer_credit_adjustments
  SET 
    remaining_amount = v_original_amount - v_total_applied,
    status = CASE
      WHEN v_total_applied >= v_original_amount THEN 'applied'
      WHEN v_total_applied > 0 THEN 'partial'
      ELSE 'pending'
    END,
    updated_at = now()
  WHERE id = COALESCE(NEW.credit_adjustment_id, OLD.credit_adjustment_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER update_credit_adjustment_on_apply
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_credit_adjustment_remaining();

-- Create trigger to update invoice adjustment_amount when adjustments are applied
CREATE OR REPLACE FUNCTION public.update_invoice_adjustment_total()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_total_adjustments NUMERIC(14,2);
  v_invoice_id UUID;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  -- Calculate total adjustments for this invoice
  SELECT COALESCE(SUM(amount), 0) INTO v_total_adjustments
  FROM invoice_adjustments
  WHERE invoice_id = v_invoice_id;
  
  -- Update invoice adjustment amount
  UPDATE invoices
  SET 
    adjustment_amount = v_total_adjustments,
    updated_at = now()
  WHERE id = v_invoice_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER update_invoice_adjustment_amount
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_invoice_adjustment_total();

-- Create view for customer credit ledger
CREATE OR REPLACE VIEW public.customer_credit_ledger_vw AS
SELECT 
  cca.id,
  cca.customer_id,
  cm.customer_name,
  cca.source_invoice_id,
  inv.invoice_no as source_invoice_no,
  cca.ncr_id,
  ncr.ncr_number,
  cca.adjustment_type,
  cca.original_amount,
  cca.remaining_amount,
  cca.currency,
  cca.reason,
  cca.rejection_qty,
  cca.unit_rate,
  cca.status,
  cca.created_at,
  cca.expires_at,
  cca.notes,
  COALESCE(
    json_agg(
      DISTINCT jsonb_build_object(
        'invoice_id', ia.invoice_id,
        'invoice_no', applied_inv.invoice_no,
        'amount', ia.amount,
        'applied_at', ia.applied_at
      )
    ) FILTER (WHERE ia.id IS NOT NULL),
    '[]'::json
  ) as applications
FROM customer_credit_adjustments cca
JOIN customer_master cm ON cm.id = cca.customer_id
LEFT JOIN invoices inv ON inv.id = cca.source_invoice_id
LEFT JOIN ncrs ncr ON ncr.id = cca.ncr_id
LEFT JOIN invoice_adjustments ia ON ia.credit_adjustment_id = cca.id
LEFT JOIN invoices applied_inv ON applied_inv.id = ia.invoice_id
GROUP BY cca.id, cm.customer_name, inv.invoice_no, ncr.ncr_number;

-- Create index for faster lookups
CREATE INDEX idx_credit_adjustments_customer ON public.customer_credit_adjustments(customer_id);
CREATE INDEX idx_credit_adjustments_status ON public.customer_credit_adjustments(status);
CREATE INDEX idx_credit_adjustments_remaining ON public.customer_credit_adjustments(remaining_amount) WHERE remaining_amount > 0;
CREATE INDEX idx_invoice_adjustments_invoice ON public.invoice_adjustments(invoice_id);
CREATE INDEX idx_invoice_adjustments_credit ON public.invoice_adjustments(credit_adjustment_id);