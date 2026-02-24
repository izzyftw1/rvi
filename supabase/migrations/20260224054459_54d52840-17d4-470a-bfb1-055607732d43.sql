
-- =============================================
-- FINANCE MODULE P0/P1 DATABASE FIXES
-- =============================================

-- #19: Unique constraint on invoice_no to prevent duplicates
ALTER TABLE public.invoices ADD CONSTRAINT invoices_invoice_no_unique UNIQUE (invoice_no);

-- #21/#25: Trigger to update invoice balance_amount and receipt allocated/unallocated on allocation
CREATE OR REPLACE FUNCTION public.handle_receipt_allocation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt_total numeric;
  v_receipt_allocated numeric;
BEGIN
  UPDATE public.invoices
  SET 
    paid_amount = COALESCE(paid_amount, 0) + NEW.allocated_amount,
    balance_amount = COALESCE(balance_amount, total_amount) - NEW.allocated_amount,
    status = CASE
      WHEN COALESCE(balance_amount, total_amount) - NEW.allocated_amount <= 0 THEN 'paid'
      WHEN COALESCE(paid_amount, 0) + NEW.allocated_amount > 0 THEN 'part_paid'
      ELSE status
    END,
    updated_at = now()
  WHERE id = NEW.invoice_id;

  SELECT total_amount, allocated_amount INTO v_receipt_total, v_receipt_allocated
  FROM public.customer_receipts WHERE id = NEW.receipt_id;

  v_receipt_allocated := COALESCE(v_receipt_allocated, 0) + NEW.allocated_amount;

  UPDATE public.customer_receipts
  SET
    allocated_amount = v_receipt_allocated,
    unallocated_amount = v_receipt_total - v_receipt_allocated,
    status = CASE
      WHEN v_receipt_total - v_receipt_allocated <= 0 THEN 'fully_allocated'
      WHEN v_receipt_allocated > 0 THEN 'partially_allocated'
      ELSE 'pending'
    END,
    updated_at = now()
  WHERE id = NEW.receipt_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_receipt_allocation_after_insert
AFTER INSERT ON public.receipt_allocations
FOR EACH ROW
EXECUTE FUNCTION public.handle_receipt_allocation();

-- #28: Add exchange_rate column to customer_receipts
ALTER TABLE public.customer_receipts ADD COLUMN IF NOT EXISTS exchange_rate_to_inr numeric DEFAULT 1;

-- #34: Add status and po_id columns to supplier_payments
ALTER TABLE public.supplier_payments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';
ALTER TABLE public.supplier_payments ADD COLUMN IF NOT EXISTS po_id uuid;

-- #40/#81: Audit trigger for financial tables
CREATE OR REPLACE FUNCTION public.audit_financial_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), 
            COALESCE(current_setting('request.jwt.claims', true)::json->>'sub', NULL)::uuid);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD),
            COALESCE(current_setting('request.jwt.claims', true)::json->>'sub', NULL)::uuid);
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW),
            COALESCE(current_setting('request.jwt.claims', true)::json->>'sub', NULL)::uuid);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_invoices AFTER INSERT OR UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.audit_financial_changes();

CREATE TRIGGER audit_customer_receipts AFTER INSERT OR UPDATE OR DELETE ON public.customer_receipts
FOR EACH ROW EXECUTE FUNCTION public.audit_financial_changes();

CREATE TRIGGER audit_supplier_payments AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.audit_financial_changes();

CREATE TRIGGER audit_receipt_allocations AFTER INSERT OR UPDATE OR DELETE ON public.receipt_allocations
FOR EACH ROW EXECUTE FUNCTION public.audit_financial_changes();

CREATE TRIGGER audit_customer_credit_adjustments AFTER INSERT OR UPDATE OR DELETE ON public.customer_credit_adjustments
FOR EACH ROW EXECUTE FUNCTION public.audit_financial_changes();

-- #62/#65: Period locking table for month-end close and FY freeze
CREATE TABLE IF NOT EXISTS public.finance_period_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type text NOT NULL CHECK (period_type IN ('month', 'quarter', 'year')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  locked boolean NOT NULL DEFAULT false,
  locked_at timestamptz,
  locked_by uuid,
  unlock_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(period_type, period_start)
);

ALTER TABLE public.finance_period_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance period locks viewable by authenticated" ON public.finance_period_locks
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Finance period locks manageable by admin" ON public.finance_period_locks
FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- #63: Trigger to block backdated financial entries in locked periods
CREATE OR REPLACE FUNCTION public.check_period_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date date;
  v_locked boolean;
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    v_date := NEW.invoice_date::date;
  ELSIF TG_TABLE_NAME = 'customer_receipts' THEN
    v_date := NEW.receipt_date::date;
  ELSIF TG_TABLE_NAME = 'supplier_payments' THEN
    v_date := NEW.payment_date;
  ELSE
    RETURN NEW;
  END IF;

  SELECT locked INTO v_locked
  FROM public.finance_period_locks
  WHERE period_type = 'month'
    AND v_date >= period_start
    AND v_date <= period_end
    AND locked = true
  LIMIT 1;

  IF v_locked THEN
    RAISE EXCEPTION 'Cannot create/modify records in a locked financial period (date: %)', v_date;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER check_invoice_period_lock BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.check_period_lock();

CREATE TRIGGER check_receipt_period_lock BEFORE INSERT OR UPDATE ON public.customer_receipts
FOR EACH ROW EXECUTE FUNCTION public.check_period_lock();

CREATE TRIGGER check_payment_period_lock BEFORE INSERT OR UPDATE ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.check_period_lock();

-- #11: Add is_locked flag to invoices for edit protection after posting
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;

-- Enable realtime for finance tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_receipts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.receipt_allocations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.supplier_payments;
