
-- Add system_backfill flag to dispatch_qc_batches for tracking migrated records
ALTER TABLE public.dispatch_qc_batches 
ADD COLUMN IF NOT EXISTS system_backfill BOOLEAN DEFAULT false;

-- Backfill dispatch_qc_batches for Work Orders with passed/waived QC but no records
INSERT INTO public.dispatch_qc_batches (
  work_order_id,
  qc_batch_id,
  qc_approved_quantity,
  rejected_quantity,
  consumed_quantity,
  qc_date,
  approved_by,
  remarks,
  status,
  system_backfill
)
SELECT 
  wo.id as work_order_id,
  'BACKFILL-' || wo.wo_number as qc_batch_id,
  GREATEST(0, COALESCE(SUM(pb.produced_qty), 0) - COALESCE(SUM(pb.qc_rejected_qty), 0)) as qc_approved_quantity,
  0 as rejected_quantity,
  0 as consumed_quantity,
  wo.updated_at as qc_date,
  NULL as approved_by,
  'System backfill from legacy final_qc_result=' || wo.final_qc_result as remarks,
  'approved' as status,
  true as system_backfill
FROM work_orders wo
LEFT JOIN production_batches pb ON pb.wo_id = wo.id
WHERE wo.final_qc_result IN ('passed', 'waived')
  AND NOT EXISTS (
    SELECT 1 FROM dispatch_qc_batches dqb WHERE dqb.work_order_id = wo.id
  )
GROUP BY wo.id, wo.wo_number, wo.final_qc_result, wo.updated_at
HAVING COALESCE(SUM(pb.produced_qty), 0) > 0;
