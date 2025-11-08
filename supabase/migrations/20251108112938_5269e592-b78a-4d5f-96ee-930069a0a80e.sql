-- Add QC scheduling and status tracking to machines
ALTER TABLE public.machines 
ADD COLUMN IF NOT EXISTS last_qc_check_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS next_qc_check_due TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS qc_status TEXT DEFAULT 'ok' CHECK (qc_status IN ('ok', 'due', 'overdue', 'deviation'));

-- Create QC summary table for aggregated data
CREATE TABLE IF NOT EXISTS public.qc_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  operation operation_letter NOT NULL,
  dimension_name TEXT NOT NULL,
  min_value NUMERIC NOT NULL,
  max_value NUMERIC NOT NULL,
  avg_value NUMERIC NOT NULL,
  sample_count INTEGER NOT NULL,
  within_tolerance BOOLEAN NOT NULL,
  lower_limit NUMERIC NOT NULL,
  upper_limit NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for QC summary
CREATE INDEX IF NOT EXISTS idx_qc_summary_wo ON public.qc_summary(wo_id);
CREATE INDEX IF NOT EXISTS idx_qc_summary_machine ON public.qc_summary(machine_id);
CREATE INDEX IF NOT EXISTS idx_qc_summary_operation ON public.qc_summary(operation);

-- Enable RLS
ALTER TABLE public.qc_summary ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view QC summary"
  ON public.qc_summary FOR SELECT
  USING (true);

CREATE POLICY "Quality and production can manage QC summary"
  ON public.qc_summary FOR ALL
  USING (has_role(auth.uid(), 'quality') OR has_role(auth.uid(), 'production') OR has_role(auth.uid(), 'admin'));

-- Function to update QC summary after hourly check
CREATE OR REPLACE FUNCTION public.update_qc_summary()
RETURNS TRIGGER AS $$
DECLARE
  dim_name TEXT;
  dim_value NUMERIC;
  tol_data RECORD;
BEGIN
  -- Loop through each dimension in the check
  FOR dim_name, dim_value IN 
    SELECT key, (value)::numeric 
    FROM jsonb_each_text(NEW.dimensions) 
    WHERE value != 'null'
  LOOP
    -- Get tolerance for this dimension
    SELECT 
      (dimensions->dim_name->>'min')::numeric as min_limit,
      (dimensions->dim_name->>'max')::numeric as max_limit,
      (dimensions->dim_name->>'unit') as unit
    INTO tol_data
    FROM dimension_tolerances dt
    JOIN work_orders wo ON wo.item_code = dt.item_code AND wo.revision = dt.revision
    WHERE wo.id = NEW.wo_id
    LIMIT 1;
    
    IF tol_data IS NOT NULL THEN
      -- Insert or update summary
      INSERT INTO public.qc_summary (
        wo_id, machine_id, operation, dimension_name,
        min_value, max_value, avg_value, sample_count,
        within_tolerance, lower_limit, upper_limit, unit
      )
      SELECT 
        NEW.wo_id,
        NEW.machine_id,
        NEW.operation,
        dim_name,
        LEAST(COALESCE(MIN((dimensions->>dim_name)::numeric), dim_value), dim_value),
        GREATEST(COALESCE(MAX((dimensions->>dim_name)::numeric), dim_value), dim_value),
        COALESCE(AVG((dimensions->>dim_name)::numeric), dim_value),
        COUNT(*),
        (COALESCE(AVG((dimensions->>dim_name)::numeric), dim_value) >= tol_data.min_limit 
         AND COALESCE(AVG((dimensions->>dim_name)::numeric), dim_value) <= tol_data.max_limit),
        tol_data.min_limit,
        tol_data.max_limit,
        tol_data.unit
      FROM hourly_qc_checks
      WHERE wo_id = NEW.wo_id 
        AND machine_id = NEW.machine_id 
        AND operation = NEW.operation
        AND dimensions ? dim_name
      ON CONFLICT (wo_id, machine_id, operation, dimension_name) 
      DO UPDATE SET
        min_value = EXCLUDED.min_value,
        max_value = EXCLUDED.max_value,
        avg_value = EXCLUDED.avg_value,
        sample_count = EXCLUDED.sample_count,
        within_tolerance = EXCLUDED.within_tolerance,
        last_updated = now();
    END IF;
  END LOOP;
  
  -- Update machine QC status and schedule next check
  UPDATE public.machines
  SET 
    last_qc_check_at = NEW.check_datetime,
    next_qc_check_due = NEW.check_datetime + INTERVAL '1 hour',
    qc_status = CASE 
      WHEN NEW.status = 'fail' THEN 'deviation'
      ELSE 'ok'
    END
  WHERE id = NEW.machine_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to update summary on QC check
DROP TRIGGER IF EXISTS trigger_update_qc_summary ON public.hourly_qc_checks;
CREATE TRIGGER trigger_update_qc_summary
  AFTER INSERT ON public.hourly_qc_checks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_qc_summary();

-- Function to auto-schedule first QC check when machine starts
CREATE OR REPLACE FUNCTION public.schedule_first_qc_check()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current_wo_id IS NOT NULL AND (OLD.current_wo_id IS NULL OR OLD.current_wo_id != NEW.current_wo_id) THEN
    UPDATE public.machines
    SET 
      next_qc_check_due = now() + INTERVAL '1 hour',
      qc_status = 'ok'
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for auto-scheduling
DROP TRIGGER IF EXISTS trigger_schedule_first_qc ON public.machines;
CREATE TRIGGER trigger_schedule_first_qc
  AFTER UPDATE ON public.machines
  FOR EACH ROW
  EXECUTE FUNCTION public.schedule_first_qc_check();

-- Function to mark machines as overdue
CREATE OR REPLACE FUNCTION public.mark_overdue_qc_checks()
RETURNS void AS $$
BEGIN
  UPDATE public.machines
  SET qc_status = 'overdue'
  WHERE next_qc_check_due < now()
    AND current_wo_id IS NOT NULL
    AND qc_status != 'deviation';
    
  UPDATE public.machines
  SET qc_status = 'due'
  WHERE next_qc_check_due < now() + INTERVAL '15 minutes'
    AND next_qc_check_due >= now()
    AND current_wo_id IS NOT NULL
    AND qc_status = 'ok';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add unique constraint for qc_summary
ALTER TABLE public.qc_summary 
DROP CONSTRAINT IF EXISTS qc_summary_unique;

ALTER TABLE public.qc_summary 
ADD CONSTRAINT qc_summary_unique 
UNIQUE (wo_id, machine_id, operation, dimension_name);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.qc_summary;