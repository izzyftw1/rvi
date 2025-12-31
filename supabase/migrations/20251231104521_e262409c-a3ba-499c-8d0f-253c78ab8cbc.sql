-- Create supplier_users mapping table
CREATE TABLE public.supplier_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customer_master(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  notes TEXT,
  UNIQUE(user_id, customer_id)
);

-- Enable RLS on supplier_users
ALTER TABLE public.supplier_users ENABLE ROW LEVEL SECURITY;

-- Admins can manage supplier mappings
CREATE POLICY "Admins can manage supplier_users"
ON public.supplier_users
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
);

-- Users can view their own supplier mapping
CREATE POLICY "Users can view own supplier mapping"
ON public.supplier_users
FOR SELECT
USING (user_id = auth.uid());

-- Create index for efficient lookups
CREATE INDEX idx_supplier_users_user_id ON public.supplier_users(user_id);
CREATE INDEX idx_supplier_users_customer_id ON public.supplier_users(customer_id);

-- Insert department_defaults for Supplier department
INSERT INTO public.department_defaults (department_type, page_key, can_view, can_access_route, can_mutate)
VALUES
  ('supplier', 'sales-orders', false, false, false),
  ('supplier', 'customers', false, false, false),
  ('supplier', 'items', false, false, false),
  ('supplier', 'raw-po', false, false, false),
  ('supplier', 'material-requirements', false, false, false),
  ('supplier', 'purchase-dashboard', false, false, false),
  ('supplier', 'work-orders', true, true, false),
  ('supplier', 'daily-production-log', false, false, false),
  ('supplier', 'floor-dashboard', false, false, false),
  ('supplier', 'cnc-dashboard', false, false, false),
  ('supplier', 'production-progress', false, false, false),
  ('supplier', 'machine-utilisation', false, false, false),
  ('supplier', 'operator-efficiency', false, false, false),
  ('supplier', 'setter-efficiency', false, false, false),
  ('supplier', 'downtime-analytics', false, false, false),
  ('supplier', 'quality-dashboard', false, false, false),
  ('supplier', 'qc-incoming', false, false, false),
  ('supplier', 'hourly-qc', false, false, false),
  ('supplier', 'final-qc', false, false, false),
  ('supplier', 'ncr', false, false, false),
  ('supplier', 'traceability', false, false, false),
  ('supplier', 'quality-documents', false, false, false),
  ('supplier', 'quality-analytics', false, false, false),
  ('supplier', 'tolerances', false, false, false),
  ('supplier', 'instruments', false, false, false),
  ('supplier', 'finance-dashboard', false, false, false),
  ('supplier', 'invoices', false, false, false),
  ('supplier', 'receipts', false, false, false),
  ('supplier', 'supplier-payments', false, false, false),
  ('supplier', 'adjustments', false, false, false),
  ('supplier', 'tds-report', false, false, false),
  ('supplier', 'aging', false, false, false),
  ('supplier', 'reconciliations', false, false, false),
  ('supplier', 'finance-reports', false, false, false),
  ('supplier', 'finance-settings', false, false, false),
  ('supplier', 'gate-register', false, false, false),
  ('supplier', 'logistics-dashboard', false, false, false),
  ('supplier', 'finished-goods', false, false, false),
  ('supplier', 'packing', false, false, false),
  ('supplier', 'dispatch', false, false, false),
  ('supplier', 'partner-dashboard', false, false, false),
  ('supplier', 'external-analytics', false, false, false),
  ('supplier', 'admin-panel', false, false, false),
  ('supplier', 'factory-calendar', false, false, false)
ON CONFLICT (department_type, page_key) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_access_route = EXCLUDED.can_access_route,
  can_mutate = EXCLUDED.can_mutate;

-- Create function to check if user is a supplier
CREATE OR REPLACE FUNCTION public.is_supplier_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles p
    JOIN public.departments d ON p.department_id = d.id
    WHERE p.id = _user_id 
    AND d.type = 'supplier'
  )
$$;

-- Create function to get supplier's allowed customer IDs
CREATE OR REPLACE FUNCTION public.get_supplier_customer_ids(_user_id UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(ARRAY_AGG(customer_id), ARRAY[]::UUID[])
  FROM public.supplier_users
  WHERE user_id = _user_id
$$;

-- Create function to check supplier can access specific work order
CREATE OR REPLACE FUNCTION public.supplier_can_access_wo(_user_id UUID, _wo_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    NOT public.is_supplier_user(_user_id)
    OR
    EXISTS (
      SELECT 1 
      FROM public.work_orders wo
      JOIN public.supplier_users su ON wo.customer_id = su.customer_id
      WHERE wo.id = _wo_id 
      AND su.user_id = _user_id
    )
$$;

-- Add updated_at trigger for supplier_users
CREATE TRIGGER tr_supplier_users_updated_at
BEFORE UPDATE ON public.supplier_users
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();