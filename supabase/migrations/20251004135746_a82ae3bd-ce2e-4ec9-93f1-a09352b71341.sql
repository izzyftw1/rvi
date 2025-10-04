-- Create enum types for roles and statuses
CREATE TYPE app_role AS ENUM ('cfo', 'director', 'stores', 'purchase', 'production', 'quality', 'packing', 'accounts', 'sales');
CREATE TYPE department_type AS ENUM ('hr', 'stores', 'she', 'transport', 'sales', 'purchase', 'production', 'accounts', 'inventory', 'quality', 'quality_systems', 'maintenance', 'design', 'packing');
CREATE TYPE material_status AS ENUM ('received', 'issued', 'in_use', 'consumed');
CREATE TYPE wo_status AS ENUM ('pending', 'in_progress', 'qc', 'packing', 'completed', 'shipped');
CREATE TYPE qc_type AS ENUM ('first_piece', 'in_process', 'final');
CREATE TYPE qc_result AS ENUM ('pass', 'fail', 'rework');

-- Departments table
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type department_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users/Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  department_id UUID REFERENCES public.departments ON DELETE SET NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table (for role-based access control)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Material lots table
CREATE TABLE public.material_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id TEXT NOT NULL UNIQUE,
  heat_no TEXT NOT NULL,
  alloy TEXT NOT NULL,
  supplier TEXT NOT NULL,
  mtc_file TEXT,
  received_date_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  gross_weight DECIMAL(10,3) NOT NULL,
  net_weight DECIMAL(10,3) NOT NULL,
  bin_location TEXT,
  status material_status NOT NULL DEFAULT 'received',
  received_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Work orders table
CREATE TABLE public.work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id TEXT NOT NULL UNIQUE,
  customer TEXT NOT NULL,
  item_code TEXT NOT NULL,
  revision TEXT,
  bom JSONB,
  quantity INTEGER NOT NULL,
  due_date DATE NOT NULL,
  priority INTEGER DEFAULT 3,
  sales_order TEXT,
  status wo_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Material issues to WO
CREATE TABLE public.wo_material_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id UUID REFERENCES public.work_orders ON DELETE CASCADE NOT NULL,
  lot_id UUID REFERENCES public.material_lots ON DELETE CASCADE NOT NULL,
  quantity_kg DECIMAL(10,3),
  quantity_pcs INTEGER,
  uom TEXT NOT NULL,
  issued_by UUID REFERENCES auth.users ON DELETE SET NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Routing steps table
CREATE TABLE public.routing_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id UUID REFERENCES public.work_orders ON DELETE CASCADE NOT NULL,
  step_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  department_id UUID REFERENCES public.departments ON DELETE SET NULL,
  planned_start TIMESTAMPTZ,
  planned_end TIMESTAMPTZ,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  owner_id UUID REFERENCES auth.users ON DELETE SET NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wo_id, step_number)
);

-- Scan events table
CREATE TABLE public.scan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  station TEXT,
  owner_id UUID REFERENCES auth.users ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments ON DELETE SET NULL,
  scan_date_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  quantity DECIMAL(10,3),
  remarks TEXT,
  photos TEXT[]
);

-- QC records table
CREATE TABLE public.qc_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qc_id TEXT NOT NULL UNIQUE,
  wo_id UUID REFERENCES public.work_orders ON DELETE CASCADE NOT NULL,
  step_id UUID REFERENCES public.routing_steps ON DELETE SET NULL,
  qc_type qc_type NOT NULL,
  result qc_result NOT NULL,
  measurements JSONB,
  oes_xrf_file TEXT,
  ppap_refs TEXT[],
  approved_by UUID REFERENCES auth.users ON DELETE SET NULL,
  qc_date_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cartons table
CREATE TABLE public.cartons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carton_id TEXT NOT NULL UNIQUE,
  wo_id UUID REFERENCES public.work_orders ON DELETE CASCADE NOT NULL,
  net_weight DECIMAL(10,3) NOT NULL,
  gross_weight DECIMAL(10,3) NOT NULL,
  quantity INTEGER NOT NULL,
  labels JSONB,
  heat_nos TEXT[] NOT NULL,
  built_by UUID REFERENCES auth.users ON DELETE SET NULL,
  built_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pallets table
CREATE TABLE public.pallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pallet_id TEXT NOT NULL UNIQUE,
  built_by UUID REFERENCES auth.users ON DELETE SET NULL,
  built_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pallet cartons junction table
CREATE TABLE public.pallet_cartons (
  pallet_id UUID REFERENCES public.pallets ON DELETE CASCADE NOT NULL,
  carton_id UUID REFERENCES public.cartons ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (pallet_id, carton_id)
);

-- Shipments table
CREATE TABLE public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ship_id TEXT NOT NULL UNIQUE,
  customer TEXT NOT NULL,
  coo_file TEXT,
  packing_list_file TEXT,
  invoice_file TEXT,
  incoterm TEXT,
  ship_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shipment pallets junction table
CREATE TABLE public.shipment_pallets (
  shipment_id UUID REFERENCES public.shipments ON DELETE CASCADE NOT NULL,
  pallet_id UUID REFERENCES public.pallets ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (shipment_id, pallet_id)
);

-- Audit log table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  changed_by UUID REFERENCES auth.users ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wo_material_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qc_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cartons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pallet_cartons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_pallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS Policies - Allow authenticated users to read most data
CREATE POLICY "Authenticated users can view departments"
  ON public.departments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Authenticated users can view material lots"
  ON public.material_lots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Stores can create material lots"
  ON public.material_lots FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'stores'));

CREATE POLICY "Stores can update material lots"
  ON public.material_lots FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'stores'));

CREATE POLICY "Authenticated users can view work orders"
  ON public.work_orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Production and sales can create work orders"
  ON public.work_orders FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'production') OR public.has_role(auth.uid(), 'sales'));

CREATE POLICY "Production can update work orders"
  ON public.work_orders FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'production'));

CREATE POLICY "Authenticated users can view material issues"
  ON public.wo_material_issues FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Stores can create material issues"
  ON public.wo_material_issues FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'stores'));

CREATE POLICY "Authenticated users can view routing steps"
  ON public.routing_steps FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Production can manage routing steps"
  ON public.routing_steps FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'production'));

CREATE POLICY "Authenticated users can view scan events"
  ON public.scan_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create scan events"
  ON public.scan_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view QC records"
  ON public.qc_records FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Quality can manage QC records"
  ON public.qc_records FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'quality'));

CREATE POLICY "Authenticated users can view cartons"
  ON public.cartons FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Packing can manage cartons"
  ON public.cartons FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'packing'));

CREATE POLICY "Authenticated users can view pallets"
  ON public.pallets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Packing can manage pallets"
  ON public.pallets FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'packing'));

CREATE POLICY "Authenticated users can view pallet cartons"
  ON public.pallet_cartons FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Packing can manage pallet cartons"
  ON public.pallet_cartons FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'packing'));

CREATE POLICY "Authenticated users can view shipments"
  ON public.shipments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Accounts can manage shipments"
  ON public.shipments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'accounts'));

CREATE POLICY "Authenticated users can view shipment pallets"
  ON public.shipment_pallets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Accounts can manage shipment pallets"
  ON public.shipment_pallets FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'accounts'));

CREATE POLICY "Authenticated users can view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can create audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Seed departments
INSERT INTO public.departments (name, type) VALUES
  ('HR', 'hr'),
  ('Stores', 'stores'),
  ('Safety Health Environment', 'she'),
  ('Transport & Logistics', 'transport'),
  ('Sales', 'sales'),
  ('Purchase', 'purchase'),
  ('Production', 'production'),
  ('Accounts', 'accounts'),
  ('Inventory', 'inventory'),
  ('Quality Control', 'quality'),
  ('Quality Systems', 'quality_systems'),
  ('Maintenance', 'maintenance'),
  ('Design', 'design'),
  ('Packing', 'packing');

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_material_lots_updated_at
  BEFORE UPDATE ON public.material_lots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_work_orders_updated_at
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();