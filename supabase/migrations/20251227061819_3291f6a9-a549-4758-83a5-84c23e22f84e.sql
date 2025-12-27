-- Lock down proforma-invoices storage bucket RLS
-- Remove existing INSERT/DELETE policies for client users
-- Service role bypasses RLS, so uploads from Edge Functions will still work

-- Drop existing INSERT policy that allows client writes
DROP POLICY IF EXISTS "Sales and admin can upload proforma invoices" ON storage.objects;

-- Drop existing DELETE policy that allows client deletes
DROP POLICY IF EXISTS "Sales and admin can delete proforma invoices" ON storage.objects;

-- The existing SELECT policy "Authenticated users can view proforma invoices" remains
-- allowing authenticated users to READ files (needed for signed URL validation)

-- Now only service role (Edge Functions) can INSERT/UPDATE/DELETE
-- Users can only SELECT (read) via signed URLs