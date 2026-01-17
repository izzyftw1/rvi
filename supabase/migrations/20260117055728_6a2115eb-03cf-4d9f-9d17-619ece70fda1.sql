-- Fix customer_master: Add finance and logistics to SELECT access
-- Current policy only allows sales + admin, need to also include finance and logistics
DROP POLICY IF EXISTS "Authorized departments can view customers" ON public.customer_master;

CREATE POLICY "Authorized departments can view customers" ON public.customer_master
FOR SELECT USING (
  is_admin_user(auth.uid())
  OR has_department_type(auth.uid(), 'sales')
  OR has_department_type(auth.uid(), 'finance')
  OR has_department_type(auth.uid(), 'logistics')
);

-- Fix invoices: Add sales department to SELECT access
-- Current policies use is_admin_user which is admin/finance/super_admin, need to add sales explicitly
DROP POLICY IF EXISTS "Finance can view invoices" ON public.invoices;

CREATE POLICY "Authorized departments can view invoices" ON public.invoices
FOR SELECT USING (
  is_admin_user(auth.uid())
  OR has_department_type(auth.uid(), 'sales')
);

-- Fix suppliers: Add procurement and finance explicitly
-- Current policy allows production + admin, should also include procurement and finance
DROP POLICY IF EXISTS "Authorized can view suppliers" ON public.suppliers;

CREATE POLICY "Authorized departments can view suppliers" ON public.suppliers
FOR SELECT USING (
  is_admin_user(auth.uid())
  OR has_department_type(auth.uid(), 'production')
  OR has_department_type(auth.uid(), 'procurement')
);