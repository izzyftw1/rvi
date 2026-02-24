
-- =====================================================
-- FINANCE AUDIT FIXES: P0/P1/P2 + Missing Features
-- =====================================================

-- FIX #11: Invoice edit lock - add is_locked column if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='is_locked') THEN
    ALTER TABLE public.invoices ADD COLUMN is_locked boolean DEFAULT false;
  END IF;
END $$;

-- FIX #12: GST split columns for CGST/SGST/IGST
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='cgst_amount') THEN
    ALTER TABLE public.invoices ADD COLUMN cgst_amount numeric DEFAULT 0;
    ALTER TABLE public.invoices ADD COLUMN sgst_amount numeric DEFAULT 0;
    ALTER TABLE public.invoices ADD COLUMN igst_amount numeric DEFAULT 0;
    ALTER TABLE public.invoices ADD COLUMN gst_type text DEFAULT 'igst'; -- igst, cgst_sgst
  END IF;
END $$;

-- FIX #21: Prevent receipt deletion after allocation via trigger
CREATE OR REPLACE FUNCTION public.prevent_receipt_delete_if_allocated()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.allocated_amount > 0 THEN
    RAISE EXCEPTION 'Cannot delete receipt with existing allocations. Deallocate first.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_receipt_delete ON public.customer_receipts;
CREATE TRIGGER trg_prevent_receipt_delete
  BEFORE DELETE ON public.customer_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_receipt_delete_if_allocated();

-- FIX #22: Prevent overpayment - allocation cannot exceed invoice balance
CREATE OR REPLACE FUNCTION public.validate_allocation_amount()
RETURNS TRIGGER AS $$
DECLARE
  inv_balance numeric;
  receipt_unalloc numeric;
BEGIN
  -- Check invoice balance
  SELECT balance_amount INTO inv_balance FROM public.invoices WHERE id = NEW.invoice_id;
  IF NEW.allocated_amount > inv_balance THEN
    RAISE EXCEPTION 'Allocation amount (%) exceeds invoice balance (%)', NEW.allocated_amount, inv_balance;
  END IF;
  
  -- Check receipt unallocated
  SELECT unallocated_amount INTO receipt_unalloc FROM public.customer_receipts WHERE id = NEW.receipt_id;
  IF receipt_unalloc IS NOT NULL AND NEW.allocated_amount > receipt_unalloc THEN
    RAISE EXCEPTION 'Allocation amount (%) exceeds receipt unallocated amount (%)', NEW.allocated_amount, receipt_unalloc;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_allocation ON public.receipt_allocations;
CREATE TRIGGER trg_validate_allocation
  BEFORE INSERT ON public.receipt_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_allocation_amount();

-- FIX #24: Exchange rate stored at receipt date
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customer_receipts' AND column_name='exchange_rate_to_inr') THEN
    ALTER TABLE public.customer_receipts ADD COLUMN exchange_rate_to_inr numeric DEFAULT 1;
  END IF;
END $$;

-- FIX #36: Supplier invoice entity for AP tracking
CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  po_id uuid,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  balance_amount numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'INR',
  status text DEFAULT 'pending', -- pending, part_paid, paid, cancelled
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(supplier_id, invoice_number)
);

ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view supplier invoices"
  ON public.supplier_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert supplier invoices"
  ON public.supplier_invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update supplier invoices"
  ON public.supplier_invoices FOR UPDATE TO authenticated USING (true);

-- FIX #37: Link supplier_payments to supplier_invoices
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='supplier_payments' AND column_name='supplier_invoice_id') THEN
    ALTER TABLE public.supplier_payments ADD COLUMN supplier_invoice_id uuid REFERENCES public.supplier_invoices(id);
  END IF;
END $$;

-- FIX #46: Adjustment approval required flag
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customer_credit_adjustments' AND column_name='approved_by') THEN
    ALTER TABLE public.customer_credit_adjustments ADD COLUMN approved_by uuid;
    ALTER TABLE public.customer_credit_adjustments ADD COLUMN approved_at timestamptz;
    ALTER TABLE public.customer_credit_adjustments ADD COLUMN requires_approval boolean DEFAULT true;
  END IF;
END $$;

-- FIX #67: Auto-update invoice status to overdue via function
CREATE OR REPLACE FUNCTION public.update_overdue_invoices()
RETURNS void AS $$
BEGIN
  UPDATE public.invoices
  SET status = 'overdue'
  WHERE status = 'issued'
    AND due_date < CURRENT_DATE
    AND balance_amount > 0;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Enable realtime for supplier_invoices
ALTER PUBLICATION supabase_realtime ADD TABLE public.supplier_invoices;
