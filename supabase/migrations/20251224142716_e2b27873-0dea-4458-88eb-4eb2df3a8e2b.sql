-- Add financial impact classification to NCRs
ALTER TABLE public.ncrs ADD COLUMN IF NOT EXISTS financial_impact_type text CHECK (financial_impact_type IN ('SCRAP', 'REWORK', 'CUSTOMER_REJECTION'));

-- Add invoice/dispatch linkage for customer rejections
ALTER TABLE public.ncrs ADD COLUMN IF NOT EXISTS linked_invoice_id uuid REFERENCES public.invoices(id);
ALTER TABLE public.ncrs ADD COLUMN IF NOT EXISTS linked_dispatch_id uuid REFERENCES public.dispatches(id);

-- Add cost impact calculated field
ALTER TABLE public.ncrs ADD COLUMN IF NOT EXISTS cost_impact numeric DEFAULT 0;
ALTER TABLE public.ncrs ADD COLUMN IF NOT EXISTS adjustment_created boolean DEFAULT false;

-- Create index for finance queries
CREATE INDEX IF NOT EXISTS idx_ncrs_financial_impact ON public.ncrs(financial_impact_type) WHERE financial_impact_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ncrs_linked_invoice ON public.ncrs(linked_invoice_id) WHERE linked_invoice_id IS NOT NULL;

-- Update customer_credit_adjustments to better link with NCRs
COMMENT ON COLUMN public.customer_credit_adjustments.ncr_id IS 'Reference to the NCR that generated this customer adjustment';