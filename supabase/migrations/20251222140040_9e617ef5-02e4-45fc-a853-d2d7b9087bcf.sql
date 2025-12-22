-- Update get_wo_progress function to read from daily_production_logs
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
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(dpl.actual_quantity), 0)::INTEGER as total_completed,
    COALESCE(SUM(dpl.total_rejection_quantity), 0)::INTEGER as total_scrap,
    COALESCE(SUM(dpl.ok_quantity), 0)::INTEGER as net_completed,
    wo.quantity::INTEGER as target_quantity,
    CASE 
      WHEN wo.quantity > 0 THEN 
        ROUND((COALESCE(SUM(dpl.ok_quantity), 0) * 100.0 / wo.quantity), 2)
      ELSE 0
    END as progress_percentage,
    GREATEST(wo.quantity - COALESCE(SUM(dpl.ok_quantity), 0), 0)::INTEGER as remaining_quantity
  FROM public.work_orders wo
  LEFT JOIN public.daily_production_logs dpl ON dpl.wo_id = wo.id
  WHERE wo.id = _wo_id
  GROUP BY wo.id, wo.quantity;
END;
$$;

-- Enable realtime for daily_production_logs
ALTER TABLE public.daily_production_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_production_logs;