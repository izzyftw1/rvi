-- Extend customer_credit_adjustments to support close-adjusted flow
-- Add 'price_claim' and 'commercial' to adjustment types if not there
-- The table already has: customer_id, source_invoice_id, adjustment_type, original_amount, remaining_amount, status

-- Add invoice_closure_adjustment_id to link back to the closure record
ALTER TABLE public.customer_credit_adjustments 
  ADD COLUMN IF NOT EXISTS closure_adjustment_id uuid REFERENCES public.invoice_closure_adjustments(id),
  ADD COLUMN IF NOT EXISTS applied_to_invoice_id uuid REFERENCES public.invoices(id),
  ADD COLUMN IF NOT EXISTS applied_at timestamp with time zone;

-- Create index for faster lookup of open adjustments
CREATE INDEX IF NOT EXISTS idx_customer_credit_adjustments_status_customer 
  ON public.customer_credit_adjustments(customer_id, status) 
  WHERE status = 'pending';

-- Add internal_deduction column to invoices to track applied adjustments
-- This is for internal tracking only - does not affect PDF totals
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS internal_adjustment_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS internal_adjustment_notes text;