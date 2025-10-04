-- Add SHE (Safety, Health, Environment) tables

-- Incidents table
CREATE TABLE public.she_incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_id TEXT NOT NULL UNIQUE,
  incident_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  department_id UUID REFERENCES public.departments(id),
  reported_by UUID REFERENCES auth.users(id),
  severity TEXT NOT NULL CHECK (severity IN ('minor', 'moderate', 'major', 'critical')),
  incident_type TEXT NOT NULL,
  description TEXT NOT NULL,
  injured_person TEXT,
  lost_time_hours NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'closed')),
  root_cause TEXT,
  corrective_actions TEXT,
  closed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- CAPA (Corrective and Preventive Actions) table
CREATE TABLE public.capa (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  capa_id TEXT NOT NULL UNIQUE,
  incident_id UUID REFERENCES public.she_incidents(id),
  issue_description TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('corrective', 'preventive')),
  assigned_to UUID REFERENCES auth.users(id),
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed', 'overdue')),
  completion_date TIMESTAMP WITH TIME ZONE,
  effectiveness_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Training records table
CREATE TABLE public.training_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  training_type TEXT NOT NULL,
  training_date DATE NOT NULL,
  expiry_date DATE,
  trainer TEXT,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'expired', 'pending_renewal')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- PPE (Personal Protective Equipment) table
CREATE TABLE public.ppe_inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ppe_id TEXT NOT NULL UNIQUE,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL,
  issued_to UUID REFERENCES auth.users(id),
  issue_date DATE,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'issued', 'expired', 'damaged')),
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Environmental metrics table
CREATE TABLE public.environmental_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_date DATE NOT NULL,
  energy_kwh NUMERIC,
  water_liters NUMERIC,
  waste_kg NUMERIC,
  recycled_waste_kg NUMERIC,
  emissions_co2_kg NUMERIC,
  department_id UUID REFERENCES public.departments(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Material costs tracking
CREATE TABLE public.material_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lot_id UUID REFERENCES public.material_lots(id) NOT NULL,
  cost_per_kg NUMERIC NOT NULL,
  total_cost NUMERIC NOT NULL,
  lme_copper_price NUMERIC,
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Logistics costs tracking
CREATE TABLE public.logistics_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id UUID REFERENCES public.shipments(id) NOT NULL,
  lane TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('sea', 'air', 'road', 'rail')),
  cost_amount NUMERIC NOT NULL,
  cost_per_kg NUMERIC,
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Processing costs by department/WO
CREATE TABLE public.processing_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wo_id UUID REFERENCES public.work_orders(id),
  department_id UUID REFERENCES public.departments(id),
  cost_type TEXT NOT NULL,
  cost_amount NUMERIC NOT NULL,
  description TEXT,
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Non-consumables inventory
CREATE TABLE public.non_consumables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id TEXT NOT NULL UNIQUE,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL,
  supplier TEXT,
  department_id UUID REFERENCES public.departments(id),
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  unit_cost NUMERIC,
  reorder_level NUMERIC,
  max_stock_level NUMERIC,
  last_purchased DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Non-consumables usage tracking
CREATE TABLE public.non_consumable_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID REFERENCES public.non_consumables(id) NOT NULL,
  wo_id UUID REFERENCES public.work_orders(id),
  department_id UUID REFERENCES public.departments(id),
  quantity_used NUMERIC NOT NULL,
  used_by UUID REFERENCES auth.users(id),
  usage_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.she_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ppe_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.environmental_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.non_consumables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.non_consumable_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view SHE incidents"
  ON public.she_incidents FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create SHE incidents"
  ON public.she_incidents FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can update SHE incidents"
  ON public.she_incidents FOR UPDATE USING (true);

CREATE POLICY "Authenticated users can view CAPA"
  ON public.capa FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage CAPA"
  ON public.capa FOR ALL USING (true);

CREATE POLICY "Authenticated users can view training records"
  ON public.training_records FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage training records"
  ON public.training_records FOR ALL USING (true);

CREATE POLICY "Authenticated users can view PPE inventory"
  ON public.ppe_inventory FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage PPE inventory"
  ON public.ppe_inventory FOR ALL USING (true);

CREATE POLICY "Authenticated users can view environmental metrics"
  ON public.environmental_metrics FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage environmental metrics"
  ON public.environmental_metrics FOR ALL USING (true);

CREATE POLICY "Authenticated users can view material costs"
  ON public.material_costs FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage material costs"
  ON public.material_costs FOR ALL USING (true);

CREATE POLICY "Authenticated users can view logistics costs"
  ON public.logistics_costs FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage logistics costs"
  ON public.logistics_costs FOR ALL USING (true);

CREATE POLICY "Authenticated users can view processing costs"
  ON public.processing_costs FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage processing costs"
  ON public.processing_costs FOR ALL USING (true);

CREATE POLICY "Authenticated users can view non-consumables"
  ON public.non_consumables FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage non-consumables"
  ON public.non_consumables FOR ALL USING (true);

CREATE POLICY "Authenticated users can view non-consumable usage"
  ON public.non_consumable_usage FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create non-consumable usage"
  ON public.non_consumable_usage FOR INSERT WITH CHECK (true);

-- Trigger for updating non_consumables.updated_at
CREATE TRIGGER update_non_consumables_updated_at
  BEFORE UPDATE ON public.non_consumables
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();