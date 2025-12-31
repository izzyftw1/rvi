-- =====================================================
-- USER-LEVEL PERMISSION OVERRIDES
-- Overrides department defaults for individual users
-- Admin & Finance still bypass all checks
-- =====================================================

-- 1. Create user_permission_overrides table
CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    page_key text NOT NULL,
    can_view boolean, -- NULL = use department default
    can_access_route boolean, -- NULL = use department default
    can_mutate boolean, -- NULL = use department default
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users(id),
    UNIQUE(user_id, page_key)
);

-- Enable RLS
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

-- Everyone can view their own overrides
CREATE POLICY "Users can view own permission overrides"
ON public.user_permission_overrides FOR SELECT
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- Only admins can manage permission overrides
CREATE POLICY "Admins can manage permission overrides"
ON public.user_permission_overrides FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. Update can_access_page function to check user overrides first
CREATE OR REPLACE FUNCTION public.can_access_page(
    _user_id uuid,
    _page_key text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _has_access boolean := false;
    _user_dept_type text;
    _override_access boolean;
BEGIN
    -- Admin and Finance always have full access
    IF has_role(_user_id, 'admin'::app_role) OR 
       has_role(_user_id, 'super_admin'::app_role) OR
       has_role(_user_id, 'finance_admin'::app_role) OR
       has_role(_user_id, 'accounts'::app_role) THEN
        RETURN true;
    END IF;
    
    -- Check for user-level override FIRST (takes precedence)
    SELECT can_access_route INTO _override_access
    FROM user_permission_overrides
    WHERE user_id = _user_id
      AND page_key = _page_key;
    
    -- If override exists and is not null, use it
    IF _override_access IS NOT NULL THEN
        RETURN _override_access;
    END IF;
    
    -- Get user's department type from profiles
    SELECT d.type INTO _user_dept_type
    FROM profiles p
    JOIN departments d ON d.id = p.department_id
    WHERE p.id = _user_id;
    
    IF _user_dept_type IS NULL THEN
        -- No department assigned, deny access
        RETURN false;
    END IF;
    
    -- Check department_defaults for access
    SELECT can_access_route INTO _has_access
    FROM department_defaults
    WHERE department_type = _user_dept_type
      AND page_key = _page_key;
    
    RETURN COALESCE(_has_access, false);
END;
$$;

-- 3. Create helper function to get effective permission with override logic
CREATE OR REPLACE FUNCTION public.get_effective_permission(
    _user_id uuid,
    _page_key text
)
RETURNS TABLE (
    can_view boolean,
    can_access_route boolean,
    can_mutate boolean,
    source text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _user_dept_type text;
    _override RECORD;
    _dept_default RECORD;
BEGIN
    -- Admin and Finance always have full access
    IF has_role(_user_id, 'admin'::app_role) OR 
       has_role(_user_id, 'super_admin'::app_role) OR
       has_role(_user_id, 'finance_admin'::app_role) OR
       has_role(_user_id, 'accounts'::app_role) THEN
        RETURN QUERY SELECT true, true, true, 'bypass'::text;
        RETURN;
    END IF;
    
    -- Check for user-level override
    SELECT upo.can_view, upo.can_access_route, upo.can_mutate
    INTO _override
    FROM user_permission_overrides upo
    WHERE upo.user_id = _user_id
      AND upo.page_key = _page_key;
    
    -- Get user's department type
    SELECT d.type INTO _user_dept_type
    FROM profiles p
    JOIN departments d ON d.id = p.department_id
    WHERE p.id = _user_id;
    
    -- Get department default
    SELECT dd.can_view, dd.can_access_route, dd.can_mutate
    INTO _dept_default
    FROM department_defaults dd
    WHERE dd.department_type = _user_dept_type
      AND dd.page_key = _page_key;
    
    -- Apply override logic: override takes precedence if not null
    RETURN QUERY SELECT 
        COALESCE(_override.can_view, _dept_default.can_view, false),
        COALESCE(_override.can_access_route, _dept_default.can_access_route, false),
        COALESCE(_override.can_mutate, _dept_default.can_mutate, false),
        CASE 
            WHEN _override.can_view IS NOT NULL OR _override.can_access_route IS NOT NULL OR _override.can_mutate IS NOT NULL 
            THEN 'override'::text
            WHEN _dept_default.can_view IS NOT NULL 
            THEN 'department'::text
            ELSE 'deny'::text
        END;
END;
$$;

-- 4. Add updated_at trigger
CREATE OR REPLACE FUNCTION update_user_permission_overrides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_user_permission_overrides_updated_at ON user_permission_overrides;
CREATE TRIGGER tr_user_permission_overrides_updated_at
BEFORE UPDATE ON user_permission_overrides
FOR EACH ROW
EXECUTE FUNCTION update_user_permission_overrides_updated_at();

-- 5. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_user_page 
ON user_permission_overrides(user_id, page_key);