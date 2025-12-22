-- Drop and recreate machine_status_vw to include production log metrics
DROP VIEW IF EXISTS public.machine_status_vw;

CREATE VIEW public.machine_status_vw AS
SELECT 
    m.id AS machine_id,
    m.machine_id AS machine_code,
    m.name AS machine_name,
    m.status AS base_status,
    m.department_id,
    m.site_id,
    m.location,
    m.current_wo_id,
    m.current_operator_id,
    m.operator_id,
    wo.wo_number AS running_wo,
    wo.display_id AS running_wo_display,
    wo.item_code AS running_item,
    ml.id AS active_maintenance_id,
    ml.downtime_reason,
    ml.start_time AS maintenance_start,
    ml.end_time AS maintenance_end,
    -- Current state derived from maintenance logs and current WO
    CASE
        WHEN ml.id IS NOT NULL AND ml.end_time IS NULL THEN 
            CASE 
                WHEN ml.downtime_reason ILIKE '%breakdown%' OR ml.downtime_reason ILIKE '%fault%' THEN 'down'
                ELSE 'maintenance'
            END
        WHEN m.current_wo_id IS NOT NULL THEN 'running'
        ELSE 'idle'
    END AS current_state,
    -- Downtime hours from active maintenance
    CASE
        WHEN ml.id IS NOT NULL AND ml.end_time IS NULL THEN 
            EXTRACT(EPOCH FROM (now() - ml.start_time)) / 3600
        ELSE 0
    END AS downtime_hours,
    -- Last maintenance date
    (SELECT MAX(start_time) FROM maintenance_logs WHERE machine_id = m.id AND end_time IS NOT NULL) AS last_maintenance_date,
    -- Uptime 7d calculation
    COALESCE((
        SELECT 
            CASE 
                WHEN SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, now()) - start_time))) > 0 THEN 
                    100 - (SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, now()) - start_time))) / (7 * 24 * 3600)) * 100
                ELSE 100
            END
        FROM maintenance_logs 
        WHERE machine_id = m.id AND start_time >= now() - interval '7 days'
    ), 100) AS uptime_7d,
    -- Maintenance count in last 30 days
    (SELECT COUNT(*) FROM maintenance_logs WHERE machine_id = m.id AND start_time >= now() - interval '30 days') AS maintenance_count_30d,
    -- Downtime hours in last 30 days
    COALESCE((
        SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, now()) - start_time)) / 3600) 
        FROM maintenance_logs 
        WHERE machine_id = m.id AND start_time >= now() - interval '30 days'
    ), 0) AS downtime_hours_30d,
    -- NEW: Production log metrics for today
    COALESCE(today_logs.total_run_minutes, 0) AS today_run_minutes,
    COALESCE(today_logs.total_downtime_minutes, 0) AS today_downtime_minutes,
    COALESCE(today_logs.total_output, 0) AS today_output,
    COALESCE(today_logs.total_rejection, 0) AS today_rejection,
    COALESCE(today_logs.total_ok_qty, 0) AS today_ok_qty,
    COALESCE(today_logs.avg_efficiency, 0) AS today_avg_efficiency,
    today_logs.last_log_at,
    -- NEW: Shift-wise output from production logs for today
    COALESCE(shift_a.output, 0) AS shift_a_output,
    COALESCE(shift_b.output, 0) AS shift_b_output,
    COALESCE(shift_c.output, 0) AS shift_c_output,
    -- NEW: Downtime breakdown by reason for today (JSON)
    COALESCE(today_downtime.breakdown, '[]'::jsonb) AS today_downtime_by_reason,
    m.created_at,
    m.updated_at
FROM machines m
LEFT JOIN work_orders wo ON m.current_wo_id = wo.id
LEFT JOIN maintenance_logs ml ON m.id = ml.machine_id AND ml.end_time IS NULL
-- Aggregate today's production logs per machine
LEFT JOIN LATERAL (
    SELECT 
        SUM(actual_runtime_minutes) AS total_run_minutes,
        SUM(total_downtime_minutes) AS total_downtime_minutes,
        SUM(actual_quantity) AS total_output,
        SUM(total_rejection_quantity) AS total_rejection,
        SUM(ok_quantity) AS total_ok_qty,
        AVG(efficiency_percentage) AS avg_efficiency,
        MAX(created_at) AS last_log_at
    FROM daily_production_logs
    WHERE machine_id = m.id AND log_date = CURRENT_DATE
) today_logs ON true
-- Shift A output
LEFT JOIN LATERAL (
    SELECT SUM(actual_quantity) AS output
    FROM daily_production_logs
    WHERE machine_id = m.id AND log_date = CURRENT_DATE AND shift = 'A'
) shift_a ON true
-- Shift B output
LEFT JOIN LATERAL (
    SELECT SUM(actual_quantity) AS output
    FROM daily_production_logs
    WHERE machine_id = m.id AND log_date = CURRENT_DATE AND shift = 'B'
) shift_b ON true
-- Shift C output
LEFT JOIN LATERAL (
    SELECT SUM(actual_quantity) AS output
    FROM daily_production_logs
    WHERE machine_id = m.id AND log_date = CURRENT_DATE AND shift = 'C'
) shift_c ON true
-- Downtime breakdown by reason
LEFT JOIN LATERAL (
    SELECT jsonb_agg(
        jsonb_build_object('reason', reason, 'minutes', total_minutes)
    ) AS breakdown
    FROM (
        SELECT 
            e->>'reason' AS reason,
            SUM((e->>'duration')::int) AS total_minutes
        FROM daily_production_logs dpl,
             jsonb_array_elements(dpl.downtime_events) AS e
        WHERE dpl.machine_id = m.id AND dpl.log_date = CURRENT_DATE
        GROUP BY e->>'reason'
    ) sub
) today_downtime ON true
ORDER BY m.machine_id;