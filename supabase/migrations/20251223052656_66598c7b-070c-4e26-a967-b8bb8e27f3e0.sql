-- Add target quantity and status to operation_routes for tracking completion
ALTER TABLE public.operation_routes
ADD COLUMN IF NOT EXISTS target_quantity integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS completed_quantity integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
ADD COLUMN IF NOT EXISTS started_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone DEFAULT NULL;

-- Add operation_code (route_step_id) to daily_production_logs
ALTER TABLE public.daily_production_logs
ADD COLUMN IF NOT EXISTS route_step_id uuid REFERENCES public.operation_routes(id),
ADD COLUMN IF NOT EXISTS operation_code text DEFAULT 'A';

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_daily_production_logs_route_step 
ON public.daily_production_logs(route_step_id);

-- Create a function to update operation route status when production logs are added
CREATE OR REPLACE FUNCTION public.update_route_step_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_route_step operation_routes%ROWTYPE;
  v_cumulative_ok integer;
  v_target_qty integer;
  v_work_order work_orders%ROWTYPE;
  v_next_route operation_routes%ROWTYPE;
BEGIN
  -- If no route step linked, skip
  IF NEW.route_step_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get the route step
  SELECT * INTO v_route_step 
  FROM operation_routes 
  WHERE id = NEW.route_step_id;
  
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  
  -- Calculate cumulative OK quantity for this route step
  SELECT COALESCE(SUM(ok_quantity), 0) INTO v_cumulative_ok
  FROM daily_production_logs
  WHERE route_step_id = NEW.route_step_id;
  
  -- Get target quantity (from route step or work order)
  v_target_qty := v_route_step.target_quantity;
  
  IF v_target_qty IS NULL THEN
    -- Fall back to work order quantity
    SELECT * INTO v_work_order
    FROM work_orders
    WHERE id = v_route_step.work_order_id;
    
    v_target_qty := COALESCE(v_work_order.quantity, 0);
  END IF;
  
  -- Update the route step with completed quantity
  UPDATE operation_routes
  SET 
    completed_quantity = v_cumulative_ok,
    status = CASE
      WHEN v_cumulative_ok >= v_target_qty AND v_target_qty > 0 THEN 'completed'
      WHEN v_cumulative_ok > 0 THEN 'in_progress'
      ELSE 'pending'
    END,
    started_at = CASE
      WHEN started_at IS NULL AND v_cumulative_ok > 0 THEN NOW()
      ELSE started_at
    END,
    completed_at = CASE
      WHEN v_cumulative_ok >= v_target_qty AND v_target_qty > 0 AND completed_at IS NULL THEN NOW()
      ELSE completed_at
    END
  WHERE id = NEW.route_step_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for updating route step progress
DROP TRIGGER IF EXISTS trg_update_route_step_progress ON daily_production_logs;
CREATE TRIGGER trg_update_route_step_progress
AFTER INSERT OR UPDATE ON daily_production_logs
FOR EACH ROW
EXECUTE FUNCTION update_route_step_progress();

-- Create a view for route progress with planned vs actual and bottleneck detection
CREATE OR REPLACE VIEW public.operation_route_progress_vw AS
WITH route_logs AS (
  SELECT 
    r.id as route_id,
    r.work_order_id,
    r.sequence_number,
    r.operation_type,
    r.process_name,
    r.is_external,
    r.is_mandatory,
    r.target_quantity,
    r.completed_quantity,
    r.status,
    r.started_at,
    r.completed_at,
    COALESCE(SUM(dpl.ok_quantity), 0) as actual_ok_qty,
    COALESCE(SUM(dpl.total_rejection_quantity), 0) as total_rejections,
    COALESCE(SUM(dpl.total_downtime_minutes), 0) as total_downtime_mins,
    COALESCE(SUM(dpl.actual_runtime_minutes), 0) as total_runtime_mins,
    MAX(dpl.log_date) as last_activity_date,
    COUNT(dpl.id) as log_count
  FROM operation_routes r
  LEFT JOIN daily_production_logs dpl ON dpl.route_step_id = r.id
  GROUP BY r.id, r.work_order_id, r.sequence_number, r.operation_type, r.process_name,
           r.is_external, r.is_mandatory, r.target_quantity, r.completed_quantity, 
           r.status, r.started_at, r.completed_at
),
work_order_info AS (
  SELECT id, quantity, cycle_time_seconds
  FROM work_orders
)
SELECT 
  rl.route_id,
  rl.work_order_id,
  rl.sequence_number,
  rl.operation_type,
  rl.process_name,
  rl.is_external,
  rl.is_mandatory,
  COALESCE(rl.target_quantity, wo.quantity) as planned_quantity,
  rl.actual_ok_qty,
  rl.total_rejections,
  rl.total_downtime_mins,
  rl.total_runtime_mins,
  rl.status,
  rl.started_at,
  rl.completed_at,
  rl.last_activity_date,
  rl.log_count,
  -- Calculate if this is a bottleneck (high downtime or rejections relative to output)
  CASE 
    WHEN rl.actual_ok_qty > 0 AND (rl.total_rejections::float / rl.actual_ok_qty) > 0.1 THEN 'quality_issue'
    WHEN rl.total_runtime_mins > 0 AND (rl.total_downtime_mins::float / rl.total_runtime_mins) > 0.3 THEN 'downtime_issue'
    WHEN rl.status = 'in_progress' AND rl.log_count > 5 AND rl.actual_ok_qty < (COALESCE(rl.target_quantity, wo.quantity) * 0.3) THEN 'slow_progress'
    ELSE NULL
  END as bottleneck_type,
  -- Progress percentage
  CASE 
    WHEN COALESCE(rl.target_quantity, wo.quantity) > 0 
    THEN ROUND((rl.actual_ok_qty::numeric / COALESCE(rl.target_quantity, wo.quantity)) * 100, 1)
    ELSE 0
  END as progress_pct
FROM route_logs rl
LEFT JOIN work_order_info wo ON wo.id = rl.work_order_id
ORDER BY rl.work_order_id, rl.sequence_number;