-- Create a comprehensive dashboard summary view using only 'completed' status
CREATE OR REPLACE VIEW public.dashboard_summary_vw AS
SELECT
  -- Material QC
  (SELECT COUNT(*) FROM public.material_lots WHERE qc_status = 'pending') as material_waiting_qc,
  
  -- Maintenance
  (SELECT COUNT(*) FROM public.maintenance_logs WHERE end_time IS NULL) as maintenance_overdue,
  
  -- Work Orders Delayed (due date passed and not completed)
  (SELECT COUNT(*) FROM public.work_orders 
   WHERE due_date < CURRENT_DATE AND status != 'completed') as work_orders_delayed,
  
  -- QC Pending (hourly QC checks with fail status)
  (SELECT COUNT(*) FROM public.hourly_qc_checks WHERE status = 'fail') as qc_pending_approval,
  
  -- Orders in Pipeline (pending status)
  (SELECT COUNT(*) FROM public.work_orders 
   WHERE status = 'pending') as orders_in_pipeline,
  
  -- Orders in Production
  (SELECT COUNT(*) FROM public.work_orders 
   WHERE status = 'in_progress') as orders_in_production,
  
  -- External WIP pcs
  (SELECT COALESCE(SUM(quantity_sent - COALESCE(quantity_returned, 0)), 0) 
   FROM public.wo_external_moves 
   WHERE returned_date IS NULL) as external_wip_pcs,
  
  -- Late Deliveries (work orders past due date, not completed)
  (SELECT COUNT(*) FROM public.work_orders 
   WHERE due_date < CURRENT_DATE AND status != 'completed') as late_deliveries,
  
  -- Due Today
  (SELECT COUNT(*) FROM public.work_orders 
   WHERE due_date = CURRENT_DATE AND status != 'completed') as due_today,
  
  -- On-Time Rate 7d (work orders completed on or before due date in last 7 days)
  (SELECT 
    CASE WHEN COUNT(*) > 0 
    THEN ROUND((COUNT(*) FILTER (WHERE updated_at::date <= due_date)::NUMERIC / COUNT(*)) * 100, 1)
    ELSE 100 
    END
   FROM public.work_orders 
   WHERE status = 'completed' 
   AND updated_at >= CURRENT_DATE - INTERVAL '7 days') as on_time_rate_7d;

-- Grant access
GRANT SELECT ON public.dashboard_summary_vw TO authenticated;

-- Create internal flow summary view
CREATE OR REPLACE VIEW public.internal_flow_summary_vw AS
SELECT
  stage_name,
  COUNT(DISTINCT wo.id) as active_jobs,
  COALESCE(SUM(wo.quantity - COALESCE(progress.completed, 0)), 0) as pcs_remaining,
  COALESCE(SUM((wo.quantity - COALESCE(progress.completed, 0)) * wo.net_weight_per_pc / 1000), 0) as kg_remaining,
  ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - wo.updated_at)) / 3600), 1) as avg_wait_hours
FROM (
  SELECT 'goods_in' as stage_name UNION ALL
  SELECT 'cutting' UNION ALL
  SELECT 'forging' UNION ALL
  SELECT 'production' UNION ALL
  SELECT 'quality' UNION ALL
  SELECT 'packing' UNION ALL
  SELECT 'dispatch'
) stages
LEFT JOIN public.work_orders wo ON wo.current_stage::text = stages.stage_name 
  AND wo.status != 'completed'
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(quantity_completed), 0) as completed
  FROM public.production_logs pl
  WHERE pl.wo_id = wo.id
) progress ON true
GROUP BY stage_name
ORDER BY 
  CASE stage_name
    WHEN 'goods_in' THEN 1
    WHEN 'cutting' THEN 2
    WHEN 'forging' THEN 3
    WHEN 'production' THEN 4
    WHEN 'quality' THEN 5
    WHEN 'packing' THEN 6
    WHEN 'dispatch' THEN 7
  END;

-- Grant access
GRANT SELECT ON public.internal_flow_summary_vw TO authenticated;