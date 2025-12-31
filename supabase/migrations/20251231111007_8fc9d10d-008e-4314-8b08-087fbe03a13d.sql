
-- Create supplier_accounts table for supplier portal access
CREATE TABLE public.supplier_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customer_master(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  can_view_work_orders BOOLEAN NOT NULL DEFAULT true,
  can_view_dispatches BOOLEAN NOT NULL DEFAULT false,
  can_view_invoices BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, customer_id)
);

-- Enable RLS
ALTER TABLE public.supplier_accounts ENABLE ROW LEVEL SECURITY;

-- Admins can manage supplier accounts
CREATE POLICY "Admins can manage supplier accounts"
ON public.supplier_accounts
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Suppliers can view their own account mappings
CREATE POLICY "Users can view own supplier accounts"
ON public.supplier_accounts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Create index for fast lookups
CREATE INDEX idx_supplier_accounts_user_id ON public.supplier_accounts(user_id);
CREATE INDEX idx_supplier_accounts_customer_id ON public.supplier_accounts(customer_id);

-- Add trigger for updated_at
CREATE TRIGGER update_supplier_accounts_updated_at
BEFORE UPDATE ON public.supplier_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create a view for supplier-scoped work orders (read-only)
CREATE OR REPLACE VIEW public.supplier_work_orders_vw
WITH (security_invoker = true)
AS
SELECT 
  wo.id,
  wo.wo_number,
  wo.item_code,
  wo.quantity,
  wo.status,
  wo.priority,
  wo.due_date as target_date,
  wo.created_at,
  wo.customer_id,
  wo.qty_completed,
  wo.qty_dispatched,
  wo.completion_pct,
  cm.customer_name,
  cm.party_code
FROM work_orders wo
JOIN customer_master cm ON cm.id = wo.customer_id
WHERE wo.customer_id IN (
  SELECT sa.customer_id 
  FROM supplier_accounts sa 
  WHERE sa.user_id = auth.uid() 
  AND sa.is_active = true
  AND sa.can_view_work_orders = true
);

COMMENT ON TABLE public.supplier_accounts IS 'Maps supplier users to customer accounts for read-only portal access';
COMMENT ON VIEW public.supplier_work_orders_vw IS 'Read-only work orders view scoped to supplier customer assignments';
