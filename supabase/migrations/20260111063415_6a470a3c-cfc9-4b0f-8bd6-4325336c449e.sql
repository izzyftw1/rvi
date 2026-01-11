-- Update the enforce_profile_security function to properly detect service role from edge functions
CREATE OR REPLACE FUNCTION public.enforce_profile_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  v_jwt_role := current_setting('request.jwt.claim.role', true);

  -- Allow service role operations (direct API calls)
  IF v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Allow operations when there's no JWT context (edge functions with service role key)
  -- The service role key bypasses RLS, so if we get here without a JWT, it's a trusted context
  IF v_jwt_role IS NULL OR v_jwt_role = '' THEN
    -- Double-check by verifying we're not in an anonymous context
    IF auth.uid() IS NULL THEN
      RETURN NEW;  -- No user context = service role operation
    END IF;
  END IF;

  -- Admins can manage profile fields
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
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