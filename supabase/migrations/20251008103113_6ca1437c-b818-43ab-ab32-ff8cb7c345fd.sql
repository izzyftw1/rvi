-- Create production logs table
CREATE TABLE public.production_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  machine_id UUID NOT NULL REFERENCES public.machines(id),
  operator_id UUID REFERENCES auth.users(id),
  quantity_completed INTEGER NOT NULL DEFAULT 0,
  quantity_scrap INTEGER NOT NULL DEFAULT 0,
  log_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  shift TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.production_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view production logs"
ON public.production_logs FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Production and operators can create logs"
ON public.production_logs FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'production'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  auth.uid() = operator_id
);

CREATE POLICY "Production can update logs"
ON public.production_logs FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'production'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Index for performance
CREATE INDEX idx_production_logs_wo_id ON public.production_logs(wo_id);
CREATE INDEX idx_production_logs_machine_id ON public.production_logs(machine_id);
CREATE INDEX idx_production_logs_timestamp ON public.production_logs(log_timestamp DESC);

-- Function to calculate WO progress
CREATE OR REPLACE FUNCTION public.get_wo_progress(_wo_id UUID)
RETURNS TABLE(
  total_completed INTEGER,
  total_scrap INTEGER,
  net_completed INTEGER,
  target_quantity INTEGER,
  progress_percentage NUMERIC,
  remaining_quantity INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(pl.quantity_completed), 0)::INTEGER as total_completed,
    COALESCE(SUM(pl.quantity_scrap), 0)::INTEGER as total_scrap,
    COALESCE(SUM(pl.quantity_completed) - SUM(pl.quantity_scrap), 0)::INTEGER as net_completed,
    wo.quantity::INTEGER as target_quantity,
    CASE 
      WHEN wo.quantity > 0 THEN 
        ROUND((COALESCE(SUM(pl.quantity_completed) - SUM(pl.quantity_scrap), 0) * 100.0 / wo.quantity), 2)
      ELSE 0
    END as progress_percentage,
    GREATEST(wo.quantity - COALESCE(SUM(pl.quantity_completed) - SUM(pl.quantity_scrap), 0), 0)::INTEGER as remaining_quantity
  FROM public.work_orders wo
  LEFT JOIN public.production_logs pl ON pl.wo_id = wo.id
  WHERE wo.id = _wo_id
  GROUP BY wo.id, wo.quantity;
END;
$$;

-- Trigger to log production entries
CREATE OR REPLACE FUNCTION public.log_production_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wo_actions_log (
    wo_id,
    action_type,
    department,
    performed_by,
    action_details,
    entity_reference,
    reference_type
  )
  SELECT
    NEW.wo_id,
    'production_logged',
    'Production',
    NEW.operator_id,
    jsonb_build_object(
      'machine_id', m.machine_id,
      'machine_name', m.name,
      'quantity_completed', NEW.quantity_completed,
      'quantity_scrap', NEW.quantity_scrap,
      'shift', NEW.shift,
      'remarks', NEW.remarks
    ),
    NEW.id,
    'production_log'
  FROM machines m
  WHERE m.id = NEW.machine_id;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_production_log_insert
AFTER INSERT ON public.production_logs
FOR EACH ROW
EXECUTE FUNCTION public.log_production_entry();