-- Fix raw_po_receipts INSERT policy to align with department-based RBAC used across the app
DROP POLICY IF EXISTS "Stores can create receipts" ON public.raw_po_receipts;

CREATE POLICY "Authorized ops can create receipts"
ON public.raw_po_receipts
FOR INSERT
TO authenticated
WITH CHECK (
  has_any_department_type(
    auth.uid(),
    ARRAY['admin','super_admin','finance','production','packing','procurement','purchase','stores']
  )
  OR has_role(auth.uid(), 'stores'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);