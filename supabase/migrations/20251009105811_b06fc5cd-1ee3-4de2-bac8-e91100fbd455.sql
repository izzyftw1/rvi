-- Step 1: Create enums
CREATE TYPE public.run_state AS ENUM ('running', 'stopped', 'material_wait', 'maintenance', 'setup');
CREATE TYPE public.operator_type AS ENUM ('RVI', 'CONTRACTOR');
CREATE TYPE public.shift_type AS ENUM ('DAY', 'NIGHT');

-- Step 2: Create sites table
CREATE TABLE public.sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

-- Step 3: Add site_id to departments first (users get site through dept)
ALTER TABLE public.departments
ADD COLUMN site_id UUID REFERENCES public.sites(id);

-- Step 4: Alter existing tables
ALTER TABLE public.machines 
ADD COLUMN site_id UUID REFERENCES public.sites(id);

ALTER TABLE public.work_orders 
ADD COLUMN site_id UUID REFERENCES public.sites(id);

ALTER TABLE public.production_logs 
ADD COLUMN run_state run_state NOT NULL DEFAULT 'running',
ADD COLUMN downtime_minutes INTEGER NOT NULL DEFAULT 0,
ADD COLUMN setup_no TEXT,
ADD COLUMN operation_code TEXT,
ADD COLUMN operator_type operator_type NOT NULL DEFAULT 'RVI',
ADD COLUMN planned_minutes INTEGER,
ADD COLUMN target_qty INTEGER,
ADD COLUMN actions_taken TEXT;

-- Step 5: Create new tables
CREATE TABLE public.operator_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  shift shift_type NOT NULL,
  operator_id UUID REFERENCES public.profiles(id) NOT NULL,
  site_id UUID REFERENCES public.sites(id) NOT NULL,
  scheduled_minutes INTEGER NOT NULL DEFAULT 0,
  worked_minutes INTEGER NOT NULL DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(date, shift, operator_id, site_id)
);

ALTER TABLE public.operator_shifts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.machine_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES public.sites(id) NOT NULL,
  machine_id UUID REFERENCES public.machines(id) NOT NULL,
  date DATE NOT NULL,
  planned_minutes INTEGER NOT NULL DEFAULT 0,
  actual_run_minutes INTEGER NOT NULL DEFAULT 0,
  downtime_minutes INTEGER NOT NULL DEFAULT 0,
  qty_ok INTEGER NOT NULL DEFAULT 0,
  qty_scrap INTEGER NOT NULL DEFAULT 0,
  target_qty INTEGER NOT NULL DEFAULT 0,
  availability_pct NUMERIC(5,2),
  performance_pct NUMERIC(5,2),
  quality_pct NUMERIC(5,2),
  oee_pct NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(site_id, machine_id, date)
);

ALTER TABLE public.machine_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.operator_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID REFERENCES public.profiles(id) NOT NULL,
  site_id UUID REFERENCES public.sites(id) NOT NULL,
  date DATE NOT NULL,
  qty_ok INTEGER NOT NULL DEFAULT 0,
  scrap INTEGER NOT NULL DEFAULT 0,
  run_minutes INTEGER NOT NULL DEFAULT 0,
  efficiency_pct NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(operator_id, site_id, date)
);

ALTER TABLE public.operator_daily_metrics ENABLE ROW LEVEL SECURITY;

-- Step 6: Create views
CREATE OR REPLACE VIEW v_machine_daily AS
SELECT 
  m.id as machine_id,
  m.name as machine_name,
  m.site_id,
  s.name as site_name,
  pl.log_timestamp::DATE as date,
  COUNT(*) as log_count,
  SUM(pl.quantity_completed) as total_qty_ok,
  SUM(pl.quantity_scrap) as total_scrap,
  SUM(CASE WHEN pl.run_state = 'running' THEN COALESCE(pl.planned_minutes, 0) ELSE 0 END) as total_run_minutes,
  SUM(pl.downtime_minutes) as total_downtime,
  SUM(COALESCE(pl.planned_minutes, 0)) as total_planned_minutes,
  SUM(COALESCE(pl.target_qty, 0)) as total_target_qty
FROM public.production_logs pl
JOIN public.machines m ON pl.machine_id = m.id
LEFT JOIN public.sites s ON m.site_id = s.id
GROUP BY m.id, m.name, m.site_id, s.name, pl.log_timestamp::DATE;

CREATE OR REPLACE VIEW v_operator_daily AS
SELECT 
  p.id as operator_id,
  p.full_name as operator_name,
  pl.log_timestamp::DATE as date,
  m.site_id,
  s.name as site_name,
  SUM(pl.quantity_completed) as total_qty_ok,
  SUM(pl.quantity_scrap) as total_scrap,
  SUM(CASE WHEN pl.run_state = 'running' THEN COALESCE(pl.planned_minutes, 0) ELSE 0 END) as total_run_minutes
FROM public.production_logs pl
JOIN public.profiles p ON pl.operator_id = p.id
LEFT JOIN public.machines m ON pl.machine_id = m.id
LEFT JOIN public.sites s ON m.site_id = s.id
GROUP BY p.id, p.full_name, pl.log_timestamp::DATE, m.site_id, s.name;

-- Step 7: Create function to get user's site
CREATE OR REPLACE FUNCTION public.get_user_site_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.site_id
  FROM profiles p
  LEFT JOIN departments d ON p.department_id = d.id
  WHERE p.id = _user_id
  LIMIT 1;
$$;

-- Step 8: Create function to recompute metrics
CREATE OR REPLACE FUNCTION public.recompute_daily_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date DATE;
  v_machine_id UUID;
  v_operator_id UUID;
  v_site_id UUID;
  v_cycle_time NUMERIC;
BEGIN
  v_date := NEW.log_timestamp::DATE;
  v_machine_id := NEW.machine_id;
  v_operator_id := NEW.operator_id;
  
  SELECT site_id INTO v_site_id FROM machines WHERE id = v_machine_id;
  
  -- Auto-calculate target_qty if null
  IF NEW.target_qty IS NULL AND NEW.planned_minutes IS NOT NULL THEN
    SELECT cycle_time_seconds INTO v_cycle_time 
    FROM work_orders 
    WHERE id = NEW.wo_id;
    
    IF v_cycle_time IS NOT NULL AND v_cycle_time > 0 THEN
      NEW.target_qty := FLOOR((NEW.planned_minutes * 60) / v_cycle_time);
    END IF;
  END IF;
  
  -- Recompute machine_daily_metrics
  INSERT INTO machine_daily_metrics (
    site_id, machine_id, date, planned_minutes, actual_run_minutes, 
    downtime_minutes, qty_ok, qty_scrap, target_qty,
    availability_pct, performance_pct, quality_pct, oee_pct
  )
  SELECT 
    v_site_id, v_machine_id, v_date,
    COALESCE(SUM(planned_minutes), 0),
    COALESCE(SUM(CASE WHEN run_state = 'running' THEN planned_minutes ELSE 0 END), 0),
    COALESCE(SUM(downtime_minutes), 0),
    COALESCE(SUM(quantity_completed), 0),
    COALESCE(SUM(quantity_scrap), 0),
    COALESCE(SUM(target_qty), 0),
    CASE WHEN COALESCE(SUM(planned_minutes), 0) > 0 
      THEN ((COALESCE(SUM(planned_minutes), 0) - COALESCE(SUM(downtime_minutes), 0))::NUMERIC / COALESCE(SUM(planned_minutes), 0) * 100) ELSE 0 END,
    CASE WHEN COALESCE(SUM(target_qty), 0) > 0 
      THEN (COALESCE(SUM(quantity_completed), 0)::NUMERIC / COALESCE(SUM(target_qty), 0) * 100) ELSE 0 END,
    CASE WHEN COALESCE(SUM(quantity_completed), 0) > 0 
      THEN ((COALESCE(SUM(quantity_completed), 0) - COALESCE(SUM(quantity_scrap), 0))::NUMERIC / COALESCE(SUM(quantity_completed), 0) * 100) ELSE 0 END,
    CASE WHEN COALESCE(SUM(planned_minutes), 0) > 0 AND COALESCE(SUM(target_qty), 0) > 0 AND COALESCE(SUM(quantity_completed), 0) > 0
      THEN (
        ((COALESCE(SUM(planned_minutes), 0) - COALESCE(SUM(downtime_minutes), 0))::NUMERIC / COALESCE(SUM(planned_minutes), 0)) *
        (COALESCE(SUM(quantity_completed), 0)::NUMERIC / COALESCE(SUM(target_qty), 0)) *
        ((COALESCE(SUM(quantity_completed), 0) - COALESCE(SUM(quantity_scrap), 0))::NUMERIC / COALESCE(SUM(quantity_completed), 0))
      ) ELSE 0 END
  FROM production_logs
  WHERE machine_id = v_machine_id AND log_timestamp::DATE = v_date
  ON CONFLICT (site_id, machine_id, date) DO UPDATE SET
    planned_minutes = EXCLUDED.planned_minutes, actual_run_minutes = EXCLUDED.actual_run_minutes,
    downtime_minutes = EXCLUDED.downtime_minutes, qty_ok = EXCLUDED.qty_ok, qty_scrap = EXCLUDED.qty_scrap,
    target_qty = EXCLUDED.target_qty, availability_pct = EXCLUDED.availability_pct,
    performance_pct = EXCLUDED.performance_pct, quality_pct = EXCLUDED.quality_pct,
    oee_pct = EXCLUDED.oee_pct, updated_at = now();
  
  IF v_operator_id IS NOT NULL THEN
    INSERT INTO operator_daily_metrics (operator_id, site_id, date, qty_ok, scrap, run_minutes, efficiency_pct)
    SELECT v_operator_id, v_site_id, v_date,
      COALESCE(SUM(quantity_completed), 0), COALESCE(SUM(quantity_scrap), 0),
      COALESCE(SUM(CASE WHEN run_state = 'running' THEN planned_minutes ELSE 0 END), 0),
      CASE WHEN COALESCE(SUM(target_qty), 0) > 0 
        THEN (COALESCE(SUM(quantity_completed), 0)::NUMERIC / COALESCE(SUM(target_qty), 0) * 100) ELSE 0 END
    FROM production_logs WHERE operator_id = v_operator_id AND log_timestamp::DATE = v_date
    ON CONFLICT (operator_id, site_id, date) DO UPDATE SET
      qty_ok = EXCLUDED.qty_ok, scrap = EXCLUDED.scrap, run_minutes = EXCLUDED.run_minutes,
      efficiency_pct = EXCLUDED.efficiency_pct, updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Step 9: Create trigger
CREATE TRIGGER recompute_metrics_on_production_log
AFTER INSERT OR UPDATE ON public.production_logs
FOR EACH ROW EXECUTE FUNCTION public.recompute_daily_metrics();

-- Step 10: Seed data
INSERT INTO public.sites (name, code) VALUES 
  ('RVI Jamnagar', 'RVI-JAM'),
  ('Pragati Metals', 'PRAGATI')
ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE
  rvi_site_id UUID;
BEGIN
  SELECT id INTO rvi_site_id FROM sites WHERE code = 'RVI-JAM';
  UPDATE machines SET site_id = rvi_site_id WHERE site_id IS NULL;
  UPDATE work_orders SET site_id = rvi_site_id WHERE site_id IS NULL;
  UPDATE departments SET site_id = rvi_site_id WHERE site_id IS NULL;
END $$;

-- Step 11: RLS Policies
CREATE POLICY "Admins can manage sites" ON public.sites FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their site" ON public.sites FOR SELECT 
USING (has_role(auth.uid(), 'admin') OR id = get_user_site_id(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view machines" ON public.machines;
CREATE POLICY "Users can view machines in their site" ON public.machines FOR SELECT 
USING (has_role(auth.uid(), 'admin') OR site_id = get_user_site_id(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view production logs" ON public.production_logs;
CREATE POLICY "Users can view production logs in their site" ON public.production_logs FOR SELECT 
USING (has_role(auth.uid(), 'admin') OR EXISTS (
  SELECT 1 FROM machines WHERE machines.id = production_logs.machine_id AND machines.site_id = get_user_site_id(auth.uid())
));

CREATE POLICY "Admins can manage operator shifts" ON public.operator_shifts FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view shifts in their site" ON public.operator_shifts FOR SELECT 
USING (has_role(auth.uid(), 'admin') OR site_id = get_user_site_id(auth.uid()));
CREATE POLICY "Production can create shifts" ON public.operator_shifts FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'production') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage machine metrics" ON public.machine_daily_metrics FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view metrics in their site" ON public.machine_daily_metrics FOR SELECT 
USING (has_role(auth.uid(), 'admin') OR site_id = get_user_site_id(auth.uid()));

CREATE POLICY "Admins can manage operator metrics" ON public.operator_daily_metrics FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view operator metrics in their site" ON public.operator_daily_metrics FOR SELECT 
USING (has_role(auth.uid(), 'admin') OR site_id = get_user_site_id(auth.uid()));
CREATE POLICY "Operators can view their own metrics" ON public.operator_daily_metrics FOR SELECT USING (operator_id = auth.uid());