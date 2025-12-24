
-- First, update the check constraint to allow 'legacy_migration' as a valid trigger_reason
ALTER TABLE public.production_batches 
DROP CONSTRAINT IF EXISTS production_batches_trigger_reason_check;

ALTER TABLE public.production_batches 
ADD CONSTRAINT production_batches_trigger_reason_check 
CHECK (trigger_reason IN ('initial', 'qc_failure', 'gap_exceeded', 'manual', 'legacy_migration'));

-- Create implicit batches for existing Work Orders that have production history but no batches
INSERT INTO public.production_batches (
  wo_id,
  batch_number,
  started_at,
  trigger_reason,
  stage_type,
  batch_status,
  produced_qty,
  qc_approved_qty,
  qc_rejected_qty,
  dispatched_qty,
  qc_material_status,
  qc_first_piece_status,
  qc_final_status,
  production_allowed,
  dispatch_allowed
)
SELECT 
  wo.id as wo_id,
  1 as batch_number,
  COALESCE(
    (SELECT MIN(created_at) FROM daily_production_logs WHERE wo_id = wo.id),
    wo.created_at
  ) as started_at,
  'legacy_migration' as trigger_reason,
  'production' as stage_type,
  CASE 
    WHEN wo.status = 'completed' THEN 'completed'::batch_status
    ELSE 'in_progress'::batch_status
  END as batch_status,
  COALESCE((SELECT SUM(ok_quantity) FROM daily_production_logs WHERE wo_id = wo.id), 0)::integer as produced_qty,
  COALESCE((SELECT SUM(qc_approved_quantity) FROM dispatch_qc_batches WHERE work_order_id = wo.id), 0)::integer as qc_approved_qty,
  COALESCE((SELECT SUM(total_rejection_quantity) FROM daily_production_logs WHERE wo_id = wo.id), 0)::integer as qc_rejected_qty,
  COALESCE((SELECT SUM(quantity) FROM dispatches WHERE wo_id = wo.id), 0)::integer as dispatched_qty,
  CASE WHEN wo.qc_material_passed = true THEN 'passed' ELSE 'pending' END as qc_material_status,
  CASE WHEN wo.qc_first_piece_passed = true THEN 'passed' ELSE 'pending' END as qc_first_piece_status,
  CASE 
    WHEN EXISTS (SELECT 1 FROM dispatch_qc_batches WHERE work_order_id = wo.id AND status = 'approved') THEN 'passed'
    ELSE 'pending'
  END as qc_final_status,
  wo.production_allowed,
  wo.dispatch_allowed
FROM public.work_orders wo
WHERE NOT EXISTS (SELECT 1 FROM public.production_batches pb WHERE pb.wo_id = wo.id)
AND (
  EXISTS (SELECT 1 FROM daily_production_logs WHERE wo_id = wo.id)
  OR EXISTS (SELECT 1 FROM dispatches WHERE wo_id = wo.id)
  OR EXISTS (SELECT 1 FROM dispatch_qc_batches WHERE work_order_id = wo.id)
  OR EXISTS (SELECT 1 FROM qc_records WHERE wo_id = wo.id)
  OR wo.status != 'pending'
);

-- Link existing cartons to their implicit batch
UPDATE public.cartons c
SET production_batch_id = pb.id
FROM public.production_batches pb
WHERE c.wo_id = pb.wo_id
  AND c.production_batch_id IS NULL
  AND pb.trigger_reason = 'legacy_migration';
