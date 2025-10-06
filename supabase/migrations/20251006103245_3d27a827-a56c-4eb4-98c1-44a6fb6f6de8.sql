-- First update existing machines to use valid status
UPDATE public.machines 
SET status = 'idle' 
WHERE status NOT IN ('idle', 'running', 'waiting_qc', 'down', 'maintenance', 'paused');

-- Add machine assignment and scheduling tables
CREATE TABLE IF NOT EXISTS public.wo_machine_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  machine_id uuid NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id),
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  scheduled_start timestamp with time zone NOT NULL,
  scheduled_end timestamp with time zone NOT NULL,
  actual_start timestamp with time zone,
  actual_end timestamp with time zone,
  quantity_allocated integer NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  priority integer DEFAULT 3,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('scheduled', 'running', 'completed', 'paused', 'cancelled'))
);

-- Add indexes for performance
CREATE INDEX idx_wo_machine_assignments_wo ON public.wo_machine_assignments(wo_id);
CREATE INDEX idx_wo_machine_assignments_machine ON public.wo_machine_assignments(machine_id);
CREATE INDEX idx_wo_machine_assignments_status ON public.wo_machine_assignments(status);
CREATE INDEX idx_wo_machine_assignments_scheduled ON public.wo_machine_assignments(scheduled_start, scheduled_end);

-- Add current job tracking columns to machines table
ALTER TABLE public.machines 
  ADD COLUMN IF NOT EXISTS current_wo_id uuid REFERENCES public.work_orders(id),
  ADD COLUMN IF NOT EXISTS current_operator_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS current_job_start timestamp with time zone,
  ADD COLUMN IF NOT EXISTS estimated_completion timestamp with time zone;

-- Update machines status constraint
ALTER TABLE public.machines
  DROP CONSTRAINT IF EXISTS machines_status_check;

ALTER TABLE public.machines
  ADD CONSTRAINT machines_status_check 
  CHECK (status IN ('idle', 'running', 'waiting_qc', 'down', 'maintenance', 'paused'));

-- Function to calculate required machine time
CREATE OR REPLACE FUNCTION public.calculate_required_machine_time(
  _cycle_time_seconds numeric,
  _quantity integer,
  _num_machines integer DEFAULT 1
)
RETURNS interval
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN make_interval(secs => (_cycle_time_seconds * _quantity / _num_machines)::integer);
END;
$$;

-- Function to check machine availability
CREATE OR REPLACE FUNCTION public.check_machine_availability(
  _machine_id uuid,
  _start_time timestamp with time zone,
  _end_time timestamp with time zone
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 
    FROM public.wo_machine_assignments
    WHERE machine_id = _machine_id
      AND status NOT IN ('completed', 'cancelled')
      AND (
        (scheduled_start <= _start_time AND scheduled_end > _start_time) OR
        (scheduled_start < _end_time AND scheduled_end >= _end_time) OR
        (scheduled_start >= _start_time AND scheduled_end <= _end_time)
      )
  );
END;
$$;

-- Function to update machine status based on assignments
CREATE OR REPLACE FUNCTION public.update_machine_current_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.actual_start IS NOT NULL AND (OLD.actual_start IS NULL OR OLD IS NULL) THEN
    UPDATE public.machines
    SET 
      current_wo_id = NEW.wo_id,
      current_job_start = NEW.actual_start,
      estimated_completion = NEW.scheduled_end,
      status = 'running'
    WHERE id = NEW.machine_id;
  END IF;

  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed') THEN
    UPDATE public.machines
    SET 
      current_wo_id = NULL,
      current_operator_id = NULL,
      current_job_start = NULL,
      estimated_completion = NULL,
      status = 'idle'
    WHERE id = NEW.machine_id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_update_machine_current_job
  AFTER INSERT OR UPDATE ON public.wo_machine_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_machine_current_job();

-- RLS policies
ALTER TABLE public.wo_machine_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view machine assignments"
  ON public.wo_machine_assignments FOR SELECT
  USING (true);

CREATE POLICY "Production can manage machine assignments"
  ON public.wo_machine_assignments FOR ALL
  USING (has_role(auth.uid(), 'production'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Log machine assignments
CREATE OR REPLACE FUNCTION public.log_machine_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    'machine_assigned',
    'Production',
    NEW.assigned_by,
    jsonb_build_object(
      'machine_id', m.machine_id,
      'machine_name', m.name,
      'scheduled_start', NEW.scheduled_start,
      'scheduled_end', NEW.scheduled_end,
      'quantity_allocated', NEW.quantity_allocated
    ),
    NEW.id,
    'machine_assignment'
  FROM machines m
  WHERE m.id = NEW.machine_id;
  
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_log_machine_assignment
  AFTER INSERT ON public.wo_machine_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.log_machine_assignment();

CREATE TRIGGER update_wo_machine_assignments_updated_at
  BEFORE UPDATE ON public.wo_machine_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();