-- Fix 1: Remove vulnerable self-role assignment policy
DROP POLICY IF EXISTS "Users can create own user role during signup" ON user_roles;

-- Fix 2: Create secure role assignment function for signup
CREATE OR REPLACE FUNCTION public.assign_initial_role(
  _user_id uuid,
  _requested_role text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow non-privileged roles during signup
  IF _requested_role NOT IN ('sales', 'stores', 'purchase', 'production', 'quality', 'packing', 'accounts') THEN
    RAISE EXCEPTION 'Invalid role for self-registration';
  END IF;
  
  -- Prevent duplicate role assignments
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id) THEN
    RAISE EXCEPTION 'User already has roles assigned';
  END IF;
  
  INSERT INTO user_roles (user_id, role)
  VALUES (_user_id, _requested_role::app_role);
END;
$$;

-- Fix 3: Create secure role management function for admins
CREATE OR REPLACE FUNCTION public.manage_user_role(
  _target_user_id uuid,
  _role app_role,
  _action text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Validate action
  IF _action = 'add' THEN
    INSERT INTO user_roles (user_id, role)
    VALUES (_target_user_id, _role)
    ON CONFLICT DO NOTHING;
  ELSIF _action = 'remove' THEN
    DELETE FROM user_roles
    WHERE user_id = _target_user_id AND role = _role;
  ELSE
    RAISE EXCEPTION 'Invalid action. Use add or remove';
  END IF;
END;
$$;

-- Fix 4: Restrict profile access to admin and self only
DROP POLICY IF EXISTS "Users can view own profile or admins can view all" ON profiles;

CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Fix 5: Update timestamp trigger to use SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;