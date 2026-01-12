-- Drop the dependent view first
DROP VIEW IF EXISTS machine_status_vw;

-- Expand percentage/efficiency columns from numeric(5,2) to numeric(7,2)
-- This allows values up to 99,999.99% which is more than sufficient for any efficiency calculation

-- daily_production_logs
ALTER TABLE public.daily_production_logs 
ALTER COLUMN efficiency_percentage TYPE numeric(7,2);

-- machine_daily_metrics
ALTER TABLE public.machine_daily_metrics 
ALTER COLUMN availability_pct TYPE numeric(7,2),
ALTER COLUMN performance_pct TYPE numeric(7,2),
ALTER COLUMN quality_pct TYPE numeric(7,2),
ALTER COLUMN oee_pct TYPE numeric(7,2);

-- machine_utilisation_reviews
ALTER TABLE public.machine_utilisation_reviews 
ALTER COLUMN utilisation_percentage TYPE numeric(7,2);

-- operator_daily_metrics
ALTER TABLE public.operator_daily_metrics 
ALTER COLUMN efficiency_pct TYPE numeric(7,2);

-- operator_production_ledger
ALTER TABLE public.operator_production_ledger 
ALTER COLUMN efficiency_pct TYPE numeric(7,2),
ALTER COLUMN minutes_share TYPE numeric(7,2);

-- Recreate the machine_status_vw view
CREATE OR REPLACE VIEW machine_status_vw AS
SELECT m.id AS machine_id,
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
    CASE
        WHEN ml.id IS NOT NULL AND ml.end_time IS NULL THEN
        CASE
            WHEN ml.downtime_reason ~~* '%breakdown%'::text OR ml.downtime_reason ~~* '%fault%'::text THEN 'down'::text
            ELSE 'maintenance'::text
        END
        WHEN m.current_wo_id IS NOT NULL THEN 'running'::text
        ELSE 'idle'::text
    END AS current_state,
    CASE
        WHEN ml.id IS NOT NULL AND ml.end_time IS NULL THEN EXTRACT(epoch FROM now() - ml.start_time) / 3600::numeric
        ELSE 0::numeric
    END AS downtime_hours,
    ( SELECT max(maintenance_logs.start_time) AS max
           FROM maintenance_logs
          WHERE maintenance_logs.machine_id = m.id AND maintenance_logs.end_time IS NOT NULL) AS last_maintenance_date,
    COALESCE(( SELECT
                CASE
                    WHEN sum(EXTRACT(epoch FROM COALESCE(maintenance_logs.end_time, now()) - maintenance_logs.start_time)) > 0::numeric THEN 100::numeric - sum(EXTRACT(epoch FROM COALESCE(maintenance_logs.end_time, now()) - maintenance_logs.start_time)) / (7 * 24 * 3600)::numeric * 100::numeric
                    ELSE 100::numeric
                END AS "case"
           FROM maintenance_logs
          WHERE maintenance_logs.machine_id = m.id AND maintenance_logs.start_time >= (now() - '7 days'::interval)), 100::numeric) AS uptime_7d,
    ( SELECT count(*) AS count
           FROM maintenance_logs
          WHERE maintenance_logs.machine_id = m.id AND maintenance_logs.start_time >= (now() - '30 days'::interval)) AS maintenance_count_30d,
    COALESCE(( SELECT sum(EXTRACT(epoch FROM COALESCE(maintenance_logs.end_time, now()) - maintenance_logs.start_time) / 3600::numeric) AS sum
           FROM maintenance_logs
          WHERE maintenance_logs.machine_id = m.id AND maintenance_logs.start_time >= (now() - '30 days'::interval)), 0::numeric) AS downtime_hours_30d,
    COALESCE(today_logs.total_run_minutes, 0::bigint) AS today_run_minutes,
    COALESCE(today_logs.total_downtime_minutes, 0::bigint) AS today_downtime_minutes,
    COALESCE(today_logs.total_output, 0::bigint) AS today_output,
    COALESCE(today_logs.total_rejection, 0::bigint) AS today_rejection,
    COALESCE(today_logs.total_ok_qty, 0::bigint) AS today_ok_qty,
    COALESCE(today_logs.avg_efficiency, 0::numeric) AS today_avg_efficiency,
    today_logs.last_log_at,
    COALESCE(shift_a.output, 0::bigint) AS shift_a_output,
    COALESCE(shift_b.output, 0::bigint) AS shift_b_output,
    COALESCE(shift_c.output, 0::bigint) AS shift_c_output,
    COALESCE(today_downtime.breakdown, '[]'::jsonb) AS today_downtime_by_reason,
    m.created_at,
    m.updated_at
   FROM machines m
     LEFT JOIN work_orders wo ON m.current_wo_id = wo.id
     LEFT JOIN maintenance_logs ml ON m.id = ml.machine_id AND ml.end_time IS NULL
     LEFT JOIN LATERAL ( SELECT sum(daily_production_logs.actual_runtime_minutes) AS total_run_minutes,
            sum(daily_production_logs.total_downtime_minutes) AS total_downtime_minutes,
            sum(daily_production_logs.actual_quantity) AS total_output,
            sum(daily_production_logs.total_rejection_quantity) AS total_rejection,
            sum(daily_production_logs.ok_quantity) AS total_ok_qty,
            avg(daily_production_logs.efficiency_percentage) AS avg_efficiency,
            max(daily_production_logs.created_at) AS last_log_at
           FROM daily_production_logs
          WHERE daily_production_logs.machine_id = m.id AND daily_production_logs.log_date = CURRENT_DATE) today_logs ON true
     LEFT JOIN LATERAL ( SELECT sum(daily_production_logs.actual_quantity) AS output
           FROM daily_production_logs
          WHERE daily_production_logs.machine_id = m.id AND daily_production_logs.log_date = CURRENT_DATE AND daily_production_logs.shift = 'A'::text) shift_a ON true
     LEFT JOIN LATERAL ( SELECT sum(daily_production_logs.actual_quantity) AS output
           FROM daily_production_logs
          WHERE daily_production_logs.machine_id = m.id AND daily_production_logs.log_date = CURRENT_DATE AND daily_production_logs.shift = 'B'::text) shift_b ON true
     LEFT JOIN LATERAL ( SELECT sum(daily_production_logs.actual_quantity) AS output
           FROM daily_production_logs
          WHERE daily_production_logs.machine_id = m.id AND daily_production_logs.log_date = CURRENT_DATE AND daily_production_logs.shift = 'C'::text) shift_c ON true
     LEFT JOIN LATERAL ( SELECT jsonb_agg(jsonb_build_object('reason', sub.reason, 'minutes', sub.total_minutes)) AS breakdown
           FROM ( SELECT e.value ->> 'reason'::text AS reason,
                    sum((e.value ->> 'duration'::text)::integer) AS total_minutes
                   FROM daily_production_logs dpl,
                    LATERAL jsonb_array_elements(dpl.downtime_events) e(value)
                  WHERE dpl.machine_id = m.id AND dpl.log_date = CURRENT_DATE
                  GROUP BY (e.value ->> 'reason'::text)) sub) today_downtime ON true
  ORDER BY m.machine_id;