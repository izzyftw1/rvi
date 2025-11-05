-- Create roles management table
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name text NOT NULL UNIQUE,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on roles table
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- Create policies for roles table
CREATE POLICY "Everyone can view roles"
ON public.roles
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage roles"
ON public.roles
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default roles
INSERT INTO public.roles (role_name, description) VALUES
  ('admin', 'Full system access and user management'),
  ('production', 'Production floor operations and work order management'),
  ('quality', 'Quality control and inspections'),
  ('logistics', 'Shipping, receiving, and warehouse operations'),
  ('maintenance', 'Equipment maintenance and repairs'),
  ('accounts', 'Financial operations and invoicing'),
  ('sales', 'Sales orders and customer management'),
  ('stores', 'Material inventory and stores management'),
  ('purchase', 'Purchase orders and supplier management'),
  ('packing', 'Packing and dispatch operations')
ON CONFLICT (role_name) DO NOTHING;

-- Update departments policies
DROP POLICY IF EXISTS "Authenticated users can view departments" ON public.departments;

CREATE POLICY "Everyone can view departments"
ON public.departments
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage departments"
ON public.departments
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add description column to departments if not exists
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS description text;

-- Create trigger for updated_at on roles
CREATE OR REPLACE FUNCTION public.update_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_roles_updated_at ON public.roles;
CREATE TRIGGER update_roles_updated_at
BEFORE UPDATE ON public.roles
FOR EACH ROW
EXECUTE FUNCTION public.update_roles_updated_at();