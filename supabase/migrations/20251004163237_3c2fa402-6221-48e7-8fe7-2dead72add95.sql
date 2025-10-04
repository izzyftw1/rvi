-- Create dimension_tolerances table for manager setup
CREATE TABLE public.dimension_tolerances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_code TEXT NOT NULL,
  revision TEXT,
  dimension_a_min NUMERIC,
  dimension_a_max NUMERIC,
  dimension_b_min NUMERIC,
  dimension_b_max NUMERIC,
  dimension_c_min NUMERIC,
  dimension_c_max NUMERIC,
  dimension_d_min NUMERIC,
  dimension_d_max NUMERIC,
  dimension_e_min NUMERIC,
  dimension_e_max NUMERIC,
  dimension_f_min NUMERIC,
  dimension_f_max NUMERIC,
  dimension_g_min NUMERIC,
  dimension_g_max NUMERIC,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(item_code, revision)
);

-- Enable RLS on dimension_tolerances
ALTER TABLE public.dimension_tolerances ENABLE ROW LEVEL SECURITY;

-- Policies for dimension_tolerances (only managers/QC supervisors can edit)
CREATE POLICY "Authenticated users can view tolerances"
ON public.dimension_tolerances
FOR SELECT
USING (true);

CREATE POLICY "Managers can manage tolerances"
ON public.dimension_tolerances
FOR ALL
USING (
  has_role(auth.uid(), 'production'::app_role) OR 
  has_role(auth.uid(), 'quality'::app_role)
);

-- Create hourly_qc_checks table for operator entries
CREATE TABLE public.hourly_qc_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wo_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  machine_id UUID NOT NULL REFERENCES public.machines(id),
  operator_id UUID REFERENCES auth.users(id),
  check_datetime TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  dimension_a NUMERIC,
  dimension_b NUMERIC,
  dimension_c NUMERIC,
  dimension_d NUMERIC,
  dimension_e NUMERIC,
  dimension_f NUMERIC,
  dimension_g NUMERIC,
  status TEXT NOT NULL DEFAULT 'pass',
  out_of_tolerance_dimensions TEXT[],
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on hourly_qc_checks
ALTER TABLE public.hourly_qc_checks ENABLE ROW LEVEL SECURITY;

-- Policies for hourly_qc_checks
CREATE POLICY "Authenticated users can view hourly QC checks"
ON public.hourly_qc_checks
FOR SELECT
USING (true);

CREATE POLICY "Operators can create hourly QC checks"
ON public.hourly_qc_checks
FOR INSERT
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_hourly_qc_wo_id ON public.hourly_qc_checks(wo_id);
CREATE INDEX idx_hourly_qc_machine_id ON public.hourly_qc_checks(machine_id);
CREATE INDEX idx_hourly_qc_datetime ON public.hourly_qc_checks(check_datetime DESC);

-- Add trigger for updated_at on dimension_tolerances
CREATE TRIGGER update_dimension_tolerances_updated_at
BEFORE UPDATE ON public.dimension_tolerances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();