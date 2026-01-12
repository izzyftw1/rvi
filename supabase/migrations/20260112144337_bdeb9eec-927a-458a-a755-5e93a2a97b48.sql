-- Add SELECT-only policy for all authenticated users on work_orders
-- This allows Packing/Dispatch/QC pages to JOIN correctly without role restrictions
CREATE POLICY "Authenticated users can read work orders"
ON public.work_orders
FOR SELECT
TO authenticated
USING (true);

-- Note: Existing INSERT/UPDATE/DELETE policies remain unchanged
-- Write access is still restricted by role-based policies