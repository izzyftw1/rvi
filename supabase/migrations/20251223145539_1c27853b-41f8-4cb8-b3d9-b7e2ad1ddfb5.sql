-- Add quantity tracking fields to production_batches
ALTER TABLE public.production_batches
ADD COLUMN IF NOT EXISTS produced_qty INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS qc_approved_qty INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS qc_rejected_qty INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS qc_pending_qty INTEGER GENERATED ALWAYS AS (produced_qty - qc_approved_qty - qc_rejected_qty) STORED;

-- Function to sync produced_qty from daily_production_logs
CREATE OR REPLACE FUNCTION public.sync_batch_produced_qty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID;
  v_total_produced INTEGER;
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
  
  -- Calculate total produced for this batch
  SELECT COALESCE(SUM(ok_quantity), 0) INTO v_total_produced
  FROM daily_production_logs
  WHERE batch_id = v_batch_id;
  
  -- Update batch produced_qty
  UPDATE production_batches
  SET produced_qty = v_total_produced
  WHERE id = v_batch_id;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Create trigger to sync produced_qty
DROP TRIGGER IF EXISTS sync_batch_produced_qty_trigger ON public.daily_production_logs;
CREATE TRIGGER sync_batch_produced_qty_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.daily_production_logs
FOR EACH ROW
EXECUTE FUNCTION public.sync_batch_produced_qty();

-- Function to validate QC quantities
CREATE OR REPLACE FUNCTION public.validate_batch_qc_quantities()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure qc_approved_qty + qc_rejected_qty doesn't exceed produced_qty
  IF (NEW.qc_approved_qty + NEW.qc_rejected_qty) > NEW.produced_qty THEN
    RAISE EXCEPTION 'QC quantities (approved: %, rejected: %) cannot exceed produced quantity (%). Total QC: %, Produced: %', 
      NEW.qc_approved_qty, 
      NEW.qc_rejected_qty, 
      NEW.produced_qty,
      (NEW.qc_approved_qty + NEW.qc_rejected_qty),
      NEW.produced_qty;
  END IF;
  
  -- Ensure quantities are non-negative
  IF NEW.qc_approved_qty < 0 THEN
    RAISE EXCEPTION 'QC approved quantity cannot be negative';
  END IF;
  
  IF NEW.qc_rejected_qty < 0 THEN
    RAISE EXCEPTION 'QC rejected quantity cannot be negative';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to validate QC quantities
DROP TRIGGER IF EXISTS validate_batch_qc_quantities_trigger ON public.production_batches;
CREATE TRIGGER validate_batch_qc_quantities_trigger
BEFORE UPDATE ON public.production_batches
FOR EACH ROW
WHEN (NEW.qc_approved_qty IS DISTINCT FROM OLD.qc_approved_qty 
   OR NEW.qc_rejected_qty IS DISTINCT FROM OLD.qc_rejected_qty)
EXECUTE FUNCTION public.validate_batch_qc_quantities();

-- Function to update batch QC quantities from qc_records
CREATE OR REPLACE FUNCTION public.sync_batch_qc_quantities()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  SELECT 
    COALESCE(SUM(CASE WHEN result = 'passed' THEN inspected_quantity ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN result = 'failed' THEN inspected_quantity ELSE 0 END), 0)
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
$$;

-- Add inspected_quantity to qc_records if not exists
ALTER TABLE public.qc_records
ADD COLUMN IF NOT EXISTS inspected_quantity INTEGER DEFAULT 0;

-- Create trigger to sync QC quantities
DROP TRIGGER IF EXISTS sync_batch_qc_quantities_trigger ON public.qc_records;
CREATE TRIGGER sync_batch_qc_quantities_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.qc_records
FOR EACH ROW
EXECUTE FUNCTION public.sync_batch_qc_quantities();

-- Add comments for documentation
COMMENT ON COLUMN public.production_batches.produced_qty IS 'Total OK quantity produced in this batch (synced from daily_production_logs)';
COMMENT ON COLUMN public.production_batches.qc_approved_qty IS 'Quantity approved by final QC for this batch';
COMMENT ON COLUMN public.production_batches.qc_rejected_qty IS 'Quantity rejected by final QC for this batch';
COMMENT ON COLUMN public.production_batches.qc_pending_qty IS 'Quantity pending QC (produced - approved - rejected)';
COMMENT ON COLUMN public.qc_records.inspected_quantity IS 'Number of pieces inspected in this QC record';