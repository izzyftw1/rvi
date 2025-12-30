-- Fix 1: qty_remaining should be quantity - qty_dispatched, not qty_completed
-- First drop the generated column and recreate with correct formula
ALTER TABLE work_orders DROP COLUMN qty_remaining;

ALTER TABLE work_orders 
ADD COLUMN qty_remaining INTEGER GENERATED ALWAYS AS (GREATEST(quantity - COALESCE(qty_dispatched, 0), 0)) STORED;

-- Fix 2: Clean up orphaned invoice INV-001 (ensure it has proper items)
DO $$
DECLARE
  inv_id UUID;
  item_count INT;
BEGIN
  SELECT id INTO inv_id FROM invoices WHERE invoice_no = 'INV-001';
  
  IF inv_id IS NOT NULL THEN
    SELECT COUNT(*) INTO item_count FROM invoice_items WHERE invoice_id = inv_id;
    
    -- If no items, recalculate totals to 0
    IF item_count = 0 THEN
      UPDATE invoices 
      SET subtotal = 0, gst_amount = 0, total_amount = 0, balance_amount = 0 - COALESCE(paid_amount, 0)
      WHERE id = inv_id;
    END IF;
  END IF;
END $$;

-- Fix 3: Create function to sync qc_approved_qty from qc_records when Final QC passes
CREATE OR REPLACE FUNCTION public.sync_batch_qc_on_final_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When Final QC is passed, update qc_approved_qty
  IF NEW.qc_type = 'final' AND NEW.result = 'passed' AND NEW.batch_id IS NOT NULL THEN
    UPDATE production_batches
    SET 
      qc_approved_qty = COALESCE(qc_approved_qty, 0) + COALESCE(NEW.inspected_quantity, 0),
      qc_final_status = 'passed',
      qc_final_approved_at = NOW(),
      qc_final_approved_by = NEW.approved_by
    WHERE id = NEW.batch_id;
  ELSIF NEW.qc_type = 'final' AND NEW.result = 'failed' AND NEW.batch_id IS NOT NULL THEN
    UPDATE production_batches
    SET 
      qc_rejected_qty = COALESCE(qc_rejected_qty, 0) + COALESCE(NEW.inspected_quantity, 0)
    WHERE id = NEW.batch_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trigger_sync_batch_qc_on_final_approval ON qc_records;

-- Create trigger
CREATE TRIGGER trigger_sync_batch_qc_on_final_approval
  AFTER INSERT ON qc_records
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_batch_qc_on_final_approval();

-- Fix 4: Update batches where qc_final_status = 'passed' but qc_approved_qty is 0
UPDATE production_batches
SET qc_approved_qty = produced_qty - COALESCE(qc_rejected_qty, 0)
WHERE qc_final_status = 'passed' 
  AND qc_approved_qty = 0 
  AND produced_qty > 0;