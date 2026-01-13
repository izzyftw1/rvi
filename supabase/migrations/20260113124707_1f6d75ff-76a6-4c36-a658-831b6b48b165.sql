-- Drop the old RLS policies that use the has_role function
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

-- Create a security definer function to check if user is in bypass department
CREATE OR REPLACE FUNCTION public.is_admin_department(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.departments d ON p.department_id = d.id
    WHERE p.id = user_id
      AND d.type IN ('admin', 'finance', 'super_admin')
  )
$$;

-- Create new RLS policies using department-based checks
CREATE POLICY "Admin departments can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = id 
  OR public.is_admin_department(auth.uid())
);

CREATE POLICY "Admin departments can update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  auth.uid() = id 
  OR public.is_admin_department(auth.uid())
)
WITH CHECK (
  auth.uid() = id 
  OR public.is_admin_department(auth.uid())
);

-- Drop the old policy that only allows viewing own profile (it's now combined)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;