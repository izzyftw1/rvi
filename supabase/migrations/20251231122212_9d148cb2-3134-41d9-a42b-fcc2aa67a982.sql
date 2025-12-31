
-- First, create a function to sync user role from department
CREATE OR REPLACE FUNCTION public.sync_user_role_from_department()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_department_type text;
  v_role app_role;
BEGIN
  -- Skip if no department assigned
  IF NEW.department_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the department type
  SELECT type::text INTO v_department_type
  FROM departments
  WHERE id = NEW.department_id;

  -- Map department type to role
  -- The department_type enum values match the app_role enum values
  IF v_department_type IS NOT NULL THEN
    -- Cast the department type to app_role (they should match)
    v_role := v_department_type::app_role;
    
    -- Insert or update the user role
    INSERT INTO user_roles (user_id, role)
    VALUES (NEW.id, v_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on profiles for INSERT and UPDATE
DROP TRIGGER IF EXISTS sync_role_on_profile_change ON profiles;
CREATE TRIGGER sync_role_on_profile_change
  AFTER INSERT OR UPDATE OF department_id ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_role_from_department();

-- Now fix existing users who have a department but no matching role
INSERT INTO user_roles (user_id, role)
SELECT 
  p.id,
  d.type::text::app_role
FROM profiles p
JOIN departments d ON d.id = p.department_id
WHERE NOT EXISTS (
  SELECT 1 FROM user_roles ur 
  WHERE ur.user_id = p.id AND ur.role = d.type::text::app_role
)
ON CONFLICT (user_id, role) DO NOTHING;
