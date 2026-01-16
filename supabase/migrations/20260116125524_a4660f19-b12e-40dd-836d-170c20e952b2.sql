-- Fix: Super Admin (and other bypass departments) were blocked from changing other users' departments
-- because enforce_profile_security() only allowed users with the 'admin' app_role.
-- We align this with the app's department-based permission model by allowing bypass departments
-- (admin/finance/super_admin) to manage profile fields via is_admin_department().

CREATE OR REPLACE FUNCTION public.enforce_profile_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  v_jwt_role := current_setting('request.jwt.claim.role', true);

  -- Allow service role operations (direct API calls)
  IF v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Allow operations when there's no JWT context (trusted backend context)
  IF v_jwt_role IS NULL OR v_jwt_role = '' THEN
    -- If there's no authenticated user, treat as trusted context
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Admin/Finance/Super Admin departments can manage profile fields
  IF public.is_admin_department(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Users can only touch their own profile, and cannot change sensitive fields
  IF auth.uid() = NEW.id THEN
    IF TG_OP = 'INSERT' THEN
      -- Do not allow self-assigning a department on signup
      IF NEW.department_id IS NOT NULL THEN
        RAISE EXCEPTION 'department_id cannot be set during self signup';
      END IF;

      -- Do not allow self-creating an inactive user
      IF NEW.is_active IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'is_active must be true during self signup';
      END IF;

      RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
      IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
        RAISE EXCEPTION 'department_id cannot be changed by the user';
      END IF;

      IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
        RAISE EXCEPTION 'is_active cannot be changed by the user';
      END IF;

      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'Unauthorized profile change';
END;
$$;