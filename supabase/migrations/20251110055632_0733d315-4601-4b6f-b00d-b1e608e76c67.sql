-- Create comprehensive machine status view combining work orders, maintenance logs, and machine data
CREATE OR REPLACE VIEW public.machine_status_vw AS
SELECT
  m.id as machine_id,
  m.machine_id as machine_code,
  m.name as machine_name,
  m.status as base_status,
  m.department_id,
  m.site_id,
  m.location,
  m.current_wo_id,
  m.current_operator_id,
  m.operator_id,
  
  -- Current work order info
  wo.wo_number as running_wo,
  wo.display_id as running_wo_display,
  wo.item_code as running_item,
  
  -- Active maintenance check
  ml.id as active_maintenance_id,
  ml.downtime_reason,
  ml.start_time as maintenance_start,
  ml.end_time as maintenance_end,
  
  -- Calculate current state
  CASE
    WHEN ml.id IS NOT NULL AND ml.end_time IS NULL THEN 
      CASE 
        WHEN ml.downtime_reason ILIKE '%breakdown%' OR ml.downtime_reason ILIKE '%fault%' THEN 'down'
        ELSE 'maintenance'
      END
    WHEN m.current_wo_id IS NOT NULL THEN 'running'
    ELSE 'idle'
  END as current_state,
  
  -- Downtime duration (if under maintenance)
  CASE 
    WHEN ml.id IS NOT NULL AND ml.end_time IS NULL 
    THEN EXTRACT(EPOCH FROM (NOW() - ml.start_time)) / 3600
    ELSE 0 
  END as downtime_hours,
  
  -- Last maintenance date
  (SELECT MAX(start_time) 
   FROM public.maintenance_logs 
   WHERE machine_id = m.id AND end_time IS NOT NULL) as last_maintenance_date,
  
  -- Uptime percentage (7 days)
  COALESCE(
    (SELECT 
      CASE WHEN SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, NOW()) - start_time))) > 0
      THEN 100 - (SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, NOW()) - start_time))) / (7 * 24 * 3600) * 100)
      ELSE 100
      END
    FROM public.maintenance_logs
    WHERE machine_id = m.id 
      AND start_time >= NOW() - INTERVAL '7 days'),
    100
  ) as uptime_7d,
  
  -- Total maintenance count (past 30 days)
  (SELECT COUNT(*) 
   FROM public.maintenance_logs 
   WHERE machine_id = m.id 
     AND start_time >= NOW() - INTERVAL '30 days') as maintenance_count_30d,
     
  -- Total downtime hours (past 30 days)
  COALESCE(
    (SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, NOW()) - start_time)) / 3600)
     FROM public.maintenance_logs
     WHERE machine_id = m.id 
       AND start_time >= NOW() - INTERVAL '30 days'),
    0
  ) as downtime_hours_30d,
  
  m.created_at,
  m.updated_at

FROM public.machines m
LEFT JOIN public.work_orders wo ON m.current_wo_id = wo.id
LEFT JOIN public.maintenance_logs ml ON m.id = ml.machine_id 
  AND ml.end_time IS NULL
ORDER BY m.machine_id;

-- Grant access
GRANT SELECT ON public.machine_status_vw TO authenticated;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_machine_active 
ON public.maintenance_logs(machine_id, end_time) 
WHERE end_time IS NULL;