-- Fix batch_quantity for external batches from wo_external_moves
UPDATE production_batches pb
SET batch_quantity = (
  SELECT COALESCE(SUM(m.quantity_sent - COALESCE(m.quantity_returned, 0)), 0)
  FROM wo_external_moves m
  WHERE m.work_order_id = pb.wo_id
    AND m.status IN ('sent', 'in_transit', 'partial')
)
WHERE pb.stage_type = 'external'
  AND pb.ended_at IS NULL;