-- Ensure all role/user metadata update functions are SECURITY DEFINER

-- Update the update_roles_updated_at function to be SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.update_roles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- If handle_user_role_update exists, make it SECURITY DEFINER
-- (This is a safety measure in case it was created elsewhere)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'handle_user_role_update'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.handle_user_role_update() SECURITY DEFINER SET search_path = public';
  END IF;
END $$;

-- Verify all existing role-related functions are SECURITY DEFINER
-- assign_initial_role - already set ✓
-- manage_user_role - already set ✓
-- has_role - already set ✓