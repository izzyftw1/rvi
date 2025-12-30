-- Fix triggers that use incorrect qc_result enum values ('passed'/'failed' should be 'pass'/'fail')

-- Fix sync_batch_qc_on_final_approval trigger function
CREATE OR REPLACE FUNCTION public.sync_batch_qc_on_final_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- When Final QC is passed, update qc_approved_qty
  -- Using 'pass' instead of 'passed' to match qc_result enum
  IF NEW.qc_type = 'final' AND NEW.result::text = 'pass' AND NEW.batch_id IS NOT NULL THEN
    UPDATE production_batches
    SET 
      qc_approved_qty = COALESCE(qc_approved_qty, 0) + COALESCE(NEW.inspected_quantity, 0),
      qc_final_status = 'passed',
      qc_final_approved_at = NOW(),
      qc_final_approved_by = NEW.approved_by
    WHERE id = NEW.batch_id;
  ELSIF NEW.qc_type = 'final' AND NEW.result::text = 'fail' AND NEW.batch_id IS NOT NULL THEN
    UPDATE production_batches
    SET 
      qc_rejected_qty = COALESCE(qc_rejected_qty, 0) + COALESCE(NEW.inspected_quantity, 0)
    WHERE id = NEW.batch_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix sync_batch_qc_quantities trigger function
CREATE OR REPLACE FUNCTION public.sync_batch_qc_quantities()
RETURNS TRIGGER AS $$
DECLARE
  v_batch_id UUID;
  v_approved INTEGER;
  v_rejected INTEGER;
BEGIN
  -- Determine which batch to update
  IF TG_OP = 'DELETE' THEN
    v_batch_id := OLD.batch_id;
  ELSE
    v_batch_id := NEW.batch_id;
  END IF;
  
  -- Skip if no batch linked
  IF v_batch_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;
  
  -- Calculate approved/rejected quantities from qc_records
  -- Using 'pass'/'fail' to match qc_result enum values
  SELECT 
    COALESCE(SUM(CASE WHEN result::text = 'pass' THEN inspected_quantity ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN result::text = 'fail' THEN inspected_quantity ELSE 0 END), 0)
  INTO v_approved, v_rejected
  FROM qc_records
  WHERE batch_id = v_batch_id
    AND qc_type = 'final';  -- Only final QC determines approved/rejected
  
  -- Update batch quantities (this will trigger validation)
  UPDATE production_batches
  SET 
    qc_approved_qty = v_approved,
    qc_rejected_qty = v_rejected
  WHERE id = v_batch_id;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Also make alloy nullable in sales_order_line_items since Sales doesn't input manufacturing data
ALTER TABLE public.sales_order_line_items ALTER COLUMN alloy DROP NOT NULL;

-- Set default for alloy to handle inserts without manufacturing data
ALTER TABLE public.sales_order_line_items ALTER COLUMN alloy SET DEFAULT NULL;