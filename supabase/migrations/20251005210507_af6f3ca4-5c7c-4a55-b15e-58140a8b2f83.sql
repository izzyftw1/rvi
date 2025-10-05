-- Add last_login to profiles (if not exists handled by IF NOT EXISTS)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create permissions table (if not exists)
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  module TEXT NOT NULL,
  can_view BOOLEAN DEFAULT false,
  can_create BOOLEAN DEFAULT false,
  can_edit BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  can_approve BOOLEAN DEFAULT false,
  can_export BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(role, module)
);

-- Enable RLS (won't error if already enabled)
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Drop and recreate RLS policies to avoid conflicts
DROP POLICY IF EXISTS "Everyone can view role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Only admins can manage permissions" ON public.role_permissions;

CREATE POLICY "Everyone can view role permissions"
  ON public.role_permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can manage permissions"
  ON public.role_permissions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create user_audit_log table
CREATE TABLE IF NOT EXISTS public.user_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action_type TEXT NOT NULL,
  module TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  action_details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.user_audit_log ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.user_audit_log;
DROP POLICY IF EXISTS "System can insert audit logs" ON public.user_audit_log;

CREATE POLICY "Admins can view all audit logs"
  ON public.user_audit_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert audit logs"
  ON public.user_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_audit_log_user_id ON public.user_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_audit_log_created_at ON public.user_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_user_audit_log_module ON public.user_audit_log(module);

-- Insert default permissions
INSERT INTO public.role_permissions (role, module, can_view, can_create, can_edit, can_delete, can_approve, can_export)
VALUES
  ('admin', 'users', true, true, true, true, true, true),
  ('admin', 'sales_orders', true, true, true, true, true, true),
  ('admin', 'work_orders', true, true, true, true, true, true),
  ('admin', 'materials', true, true, true, true, true, true),
  ('admin', 'qc', true, true, true, true, true, true),
  ('admin', 'production', true, true, true, true, true, true),
  ('admin', 'packing', true, true, true, true, true, true),
  ('admin', 'dispatch', true, true, true, true, true, true),
  ('admin', 'reports', true, true, true, true, true, true),
  ('admin', 'genealogy', true, true, true, true, true, true),
  ('admin', 'maintenance', true, true, true, true, true, true),
  ('admin', 'design', true, true, true, true, true, true),
  ('sales', 'sales_orders', true, true, true, false, false, true),
  ('sales', 'work_orders', true, true, false, false, false, true),
  ('sales', 'reports', true, false, false, false, false, true),
  ('sales', 'genealogy', true, false, false, false, false, false),
  ('stores', 'materials', true, true, true, false, false, true),
  ('stores', 'material_requirements', true, true, true, false, false, true),
  ('stores', 'work_orders', true, false, false, false, false, false),
  ('stores', 'genealogy', true, false, false, false, false, false),
  ('quality', 'qc', true, true, true, true, true, true),
  ('quality', 'work_orders', true, false, true, false, true, true),
  ('quality', 'reports', true, false, false, false, false, true),
  ('quality', 'genealogy', true, false, false, false, false, true),
  ('quality', 'design', true, true, true, false, false, false),
  ('production', 'work_orders', true, true, true, false, false, true),
  ('production', 'production', true, true, true, false, false, true),
  ('production', 'maintenance', true, true, true, false, false, true),
  ('production', 'design', true, true, false, false, false, false),
  ('production', 'genealogy', true, false, false, false, false, false),
  ('packing', 'packing', true, true, true, false, false, true),
  ('packing', 'work_orders', true, false, false, false, false, false),
  ('packing', 'genealogy', true, false, false, false, false, false),
  ('accounts', 'sales_orders', true, false, false, false, true, true),
  ('accounts', 'purchase_orders', true, false, false, false, true, true),
  ('accounts', 'dispatch', true, true, true, true, true, true),
  ('accounts', 'reports', true, true, true, true, true, true),
  ('accounts', 'genealogy', true, false, false, false, false, true),
  ('purchase', 'purchase_orders', true, true, true, false, false, true),
  ('purchase', 'materials', true, false, false, false, false, true),
  ('purchase', 'material_requirements', true, true, true, false, false, true),
  ('cfo', 'reports', true, true, true, true, true, true),
  ('cfo', 'sales_orders', true, false, false, false, true, true),
  ('cfo', 'purchase_orders', true, false, false, false, true, true),
  ('cfo', 'genealogy', true, false, false, false, false, true),
  ('director', 'reports', true, true, true, true, true, true),
  ('director', 'work_orders', true, false, false, false, false, true),
  ('director', 'sales_orders', true, false, false, false, false, true),
  ('director', 'genealogy', true, false, false, false, false, true)
ON CONFLICT (role, module) DO NOTHING;

-- Function to check permissions
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _module TEXT, _action TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role = rp.role
    WHERE ur.user_id = _user_id AND rp.module = _module AND (
      (_action = 'view' AND rp.can_view = true) OR
      (_action = 'create' AND rp.can_create = true) OR
      (_action = 'edit' AND rp.can_edit = true) OR
      (_action = 'delete' AND rp.can_delete = true) OR
      (_action = 'approve' AND rp.can_approve = true) OR
      (_action = 'export' AND rp.can_export = true)
    )
  )
$$;

-- Update profiles RLS
DROP POLICY IF EXISTS "Users can view own profile or admins can view all" ON public.profiles;

CREATE POLICY "Users can view own profile or admins can view all"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = id) OR 
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'cfo'::app_role) OR 
    has_role(auth.uid(), 'director'::app_role)
  );

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));