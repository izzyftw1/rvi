-- Create view for external processing summary
CREATE OR REPLACE VIEW public.external_processing_summary_vw AS
WITH active_moves AS (
  SELECT
    em.process,
    em.work_order_id,
    em.quantity_sent,
    em.quantity_returned,
    em.dispatch_date,
    em.expected_return_date,
    em.returned_date,
    em.partner_id,
    wo.gross_weight_per_pc,
    wo.net_weight_per_pc
  FROM public.wo_external_moves em
  JOIN public.work_orders wo ON em.work_order_id = wo.id
  WHERE em.status IN ('sent', 'in_progress') OR (em.returned_date IS NULL AND em.quantity_returned < em.quantity_sent)
)
SELECT
  process as process_name,
  SUM(quantity_sent - COALESCE(quantity_returned, 0)) as pcs_total,
  SUM((quantity_sent - COALESCE(quantity_returned, 0)) * COALESCE(net_weight_per_pc, 0) / 1000.0) as kg_total,
  COUNT(DISTINCT work_order_id) as active_moves,
  COUNT(*) FILTER (WHERE expected_return_date < CURRENT_DATE AND returned_date IS NULL) as overdue
FROM active_moves
GROUP BY process;

-- Grant access to the view
GRANT SELECT ON public.external_processing_summary_vw TO authenticated;

-- Add RLS policies for wo_external_moves if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'wo_external_moves' 
    AND policyname = 'Everyone can view external moves'
  ) THEN
    CREATE POLICY "Everyone can view external moves"
      ON public.wo_external_moves FOR SELECT
      USING (true);
  END IF;
END $$;