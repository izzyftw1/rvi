-- Create immutable table for invoice closure adjustments
-- This tracks shortfalls when closing invoices before full payment

CREATE TABLE public.invoice_closure_adjustments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  adjustment_amount numeric NOT NULL,
  adjustment_reason text NOT NULL CHECK (adjustment_reason IN ('rejection', 'tds', 'commercial', 'other')),
  reference_type text CHECK (reference_type IN ('ncr', 'internal_note', 'credit_note', 'tds_certificate')),
  reference_id uuid NULL,
  reference_note text NULL,
  closed_by uuid REFERENCES auth.users(id),
  closed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add comment to explain immutability
COMMENT ON TABLE public.invoice_closure_adjustments IS 'Immutable audit trail for invoice closure adjustments. Records cannot be modified after creation.';

-- Add closed_adjusted status support to invoices
-- We're adding new columns, not modifying existing ones
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS closure_adjustment_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closed_adjusted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS closed_adjusted_by uuid REFERENCES auth.users(id);

-- Enable RLS
ALTER TABLE public.invoice_closure_adjustments ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Finance roles can view, only finance_admin can create
CREATE POLICY "Finance roles can view closure adjustments"
ON public.invoice_closure_adjustments
FOR SELECT
USING (
  has_role(auth.uid(), 'accounts'::app_role) OR
  has_role(auth.uid(), 'finance_admin'::app_role) OR
  has_role(auth.uid(), 'finance_user'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Finance admin can create closure adjustments"
ON public.invoice_closure_adjustments
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'finance_admin'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- Prevent updates and deletes - adjustments are immutable
-- No UPDATE or DELETE policies = immutable after creation

-- Create index for performance
CREATE INDEX idx_invoice_closure_adjustments_invoice_id ON public.invoice_closure_adjustments(invoice_id);
CREATE INDEX idx_invoice_closure_adjustments_reason ON public.invoice_closure_adjustments(adjustment_reason);