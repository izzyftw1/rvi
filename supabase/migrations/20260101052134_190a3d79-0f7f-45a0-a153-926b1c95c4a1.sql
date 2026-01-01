-- Add 'external_sync' to valid trigger_reason values (if not already done)
ALTER TABLE production_batches 
DROP CONSTRAINT IF EXISTS production_batches_trigger_reason_check;

ALTER TABLE production_batches 
ADD CONSTRAINT production_batches_trigger_reason_check 
CHECK (trigger_reason = ANY (ARRAY['initial'::text, 'qc_failure'::text, 'gap_exceeded'::text, 'manual'::text, 'legacy_migration'::text, 'external_sync'::text]));

-- Now insert production_batches for wo_external_moves that don't have any batches
-- First, for work_order_id = f370bbe5-0d78-442a-a3a3-30e699677910 (Job Work - 8000)
INSERT INTO production_batches (wo_id, batch_quantity, stage_type, external_process_type, external_partner_id, external_sent_at, stage_entered_at, batch_status, current_location_type, current_process, trigger_reason)
SELECT 
  m.work_order_id,
  SUM(m.quantity_sent - COALESCE(m.quantity_returned, 0)),
  'external'::batch_stage_type,
  m.process,
  m.partner_id,
  MIN(m.dispatch_date),
  MIN(m.dispatch_date),
  'in_progress'::batch_status,
  'external_partner',
  m.process,
  'external_sync'
FROM wo_external_moves m
WHERE m.status IN ('sent', 'in_transit', 'partial')
  AND NOT EXISTS (SELECT 1 FROM production_batches pb WHERE pb.wo_id = m.work_order_id)
GROUP BY m.work_order_id, m.process, m.partner_id;