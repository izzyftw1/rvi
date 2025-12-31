
-- =============================================================================
-- PERMANENT FIX: Keep backend RLS role checks working while UX uses departments
--
-- Problems addressed:
-- 1) Department users had no rows in user_roles => has_role() returned false => empty data.
-- 2) Previous sync trigger attempted to cast department_type -> app_role directly,
--    which breaks for department types like finance/design/hr.
-- 3) Prevent privilege escalation: users must NOT be able to set/change department_id
--    (which would indirectly grant roles).
-- =============================================================================

-- 1) Map department_type -> app_role safely (finance -> accounts, etc.)
CREATE OR REPLACE FUNCTION public.department_type_to_app_role(_dept public.department_type)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE _dept::text
    WHEN 'admin' THEN 'admin'::public.app_role
    WHEN 'finance' THEN 'accounts'::public.app_role
    WHEN 'sales' THEN 'sales'::public.app_role
    WHEN 'production' THEN 'production'::public.app_role
    WHEN 'quality' THEN 'quality'::public.app_role
    WHEN 'packing' THEN 'packing'::public.app_role
    -- design/hr currently have no app_role equivalents; return NULL intentionally
    ELSE NULL
  END;
$$;

-- 2) Sync the mapped department role into user_roles on profile create / department change
CREATE OR REPLACE FUNCTION public.sync_user_role_from_department()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_jwt_role text;
  v_new_dept_type public.department_type;
  v_old_dept_type public.department_type;
  v_new_role public.app_role;
  v_old_role public.app_role;
BEGIN
  v_jwt_role := current_setting('request.jwt.claim.role', true);

  -- Allow service role operations without additional checks
  IF v_jwt_role = 'service_role' THEN
    -- still do role sync to keep data consistent
    NULL;
  END IF;

  -- Compute new mapped role
  IF NEW.department_id IS NOT NULL THEN
    SELECT d.type INTO v_new_dept_type
    FROM public.departments d
    WHERE d.id = NEW.department_id;

    IF v_new_dept_type IS NOT NULL THEN
      v_new_role := public.department_type_to_app_role(v_new_dept_type);

      IF v_new_role IS NOT NULL THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (NEW.id, v_new_role)
        ON CONFLICT (user_id, role) DO NOTHING;
      END IF;
    END IF;
  END IF;

  -- If department changed (or cleared), remove the old mapped role (if any)
  IF TG_OP = 'UPDATE' AND (NEW.department_id IS DISTINCT FROM OLD.department_id) THEN
    IF OLD.department_id IS NOT NULL THEN
      SELECT d.type INTO v_old_dept_type
      FROM public.departments d
      WHERE d.id = OLD.department_id;

      IF v_old_dept_type IS NOT NULL THEN
        v_old_role := public.department_type_to_app_role(v_old_dept_type);

        -- Only remove if it was a mapped dept role and differs from the new mapped role
        IF v_old_role IS NOT NULL AND (v_new_role IS NULL OR v_old_role <> v_new_role) THEN
          DELETE FROM public.user_roles
          WHERE user_id = NEW.id
            AND role = v_old_role;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_role_on_profile_change ON public.profiles;
CREATE TRIGGER sync_role_on_profile_change
AFTER INSERT OR UPDATE OF department_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_role_from_department();

-- 3) Prevent privilege escalation: non-admin users cannot set/change department_id or is_active
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

  -- Allow service role operations
  IF v_jwt_role = 'service_role' THEN
    RETURN NEW;
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

DROP TRIGGER IF EXISTS enforce_profile_security_ins ON public.profiles;
CREATE TRIGGER enforce_profile_security_ins
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_security();

DROP TRIGGER IF EXISTS enforce_profile_security_upd ON public.profiles;
CREATE TRIGGER enforce_profile_security_upd
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_security();

-- 4) Backfill: ensure users with a department have the mapped department role
INSERT INTO public.user_roles (user_id, role)
SELECT
  p.id,
  public.department_type_to_app_role(d.type)
FROM public.profiles p
JOIN public.departments d ON d.id = p.department_id
WHERE public.department_type_to_app_role(d.type) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p.id
      AND ur.role = public.department_type_to_app_role(d.type)
  )
ON CONFLICT (user_id, role) DO NOTHING;
