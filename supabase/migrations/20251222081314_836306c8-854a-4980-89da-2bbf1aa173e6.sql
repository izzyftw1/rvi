-- Create daily_production_logs table
CREATE TABLE public.daily_production_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  plant TEXT NOT NULL CHECK (plant IN ('Main', 'Pragati')),
  shift TEXT NOT NULL CHECK (shift IN ('Day', 'Night')),
  machine_id UUID NOT NULL REFERENCES public.machines(id),
  wo_id UUID REFERENCES public.work_orders(id),
  setup_number TEXT NOT NULL,
  operator_id UUID REFERENCES public.people(id),
  programmer_id UUID REFERENCES public.people(id),
  -- Auto-populated from WO (cached for historical record)
  party_code TEXT,
  product_description TEXT,
  drawing_number TEXT,
  raw_material_grade TEXT,
  ordered_quantity INTEGER,
  cycle_time_seconds NUMERIC,
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create unique constraint for one entry per machine/shift/setup/day
CREATE UNIQUE INDEX idx_daily_production_logs_unique 
ON public.daily_production_logs(log_date, machine_id, shift, setup_number);

-- Enable RLS
ALTER TABLE public.daily_production_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Everyone can view daily production logs"
ON public.daily_production_logs FOR SELECT
USING (true);

CREATE POLICY "Production can manage daily production logs"
ON public.daily_production_logs FOR ALL
USING (has_role(auth.uid(), 'production'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_daily_production_logs_updated_at
BEFORE UPDATE ON public.daily_production_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();