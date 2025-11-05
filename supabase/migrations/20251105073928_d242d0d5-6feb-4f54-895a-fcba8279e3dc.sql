-- Drop existing policies on user_roles if they exist
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Managers can view all roles" ON public.user_roles;

-- Ensure RLS is enabled
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Policy: Admins have full access to manage all roles
CREATE POLICY "Admins can manage roles"
  ON public.user_roles
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Policy: Users can read their own roles
CREATE POLICY "Users can read their own role"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Production managers and admins can view all roles
CREATE POLICY "Managers can view all roles"
  ON public.user_roles
  FOR SELECT
  USING (
    has_role(auth.uid(), 'production'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Revoke all public access
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.user_roles FROM public;