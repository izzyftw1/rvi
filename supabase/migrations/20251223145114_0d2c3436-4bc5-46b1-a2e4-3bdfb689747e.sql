-- Add batch_id column to shipments for traceability
ALTER TABLE public.shipments
ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.production_batches(id);

-- Add status column if not exists
ALTER TABLE public.shipments
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- Add shipped_at column if not exists  
ALTER TABLE public.shipments
ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_shipments_batch_id ON public.shipments(batch_id);

-- Function to validate batch dispatch eligibility
CREATE OR REPLACE FUNCTION public.validate_batch_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch RECORD;
  v_wo_id UUID;
BEGIN
  -- Get the work order ID from shipment
  v_wo_id := NEW.wo_id;
  
  -- Skip validation if no WO linked or if status is not being set to shipped/delivered
  IF v_wo_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Only validate when status changes to shipped or delivered
  IF NEW.status NOT IN ('shipped', 'delivered') THEN
    RETURN NEW;
  END IF;
  
  -- If old status was already shipped/delivered, skip (already validated)
  IF TG_OP = 'UPDATE' AND OLD.status IN ('shipped', 'delivered') THEN
    RETURN NEW;
  END IF;
  
  -- Get the current active batch for this WO
  SELECT * INTO v_batch
  FROM production_batches
  WHERE wo_id = v_wo_id
  ORDER BY ended_at NULLS FIRST, batch_number DESC
  LIMIT 1;
  
  -- If no batch exists, this is legacy data - allow dispatch but log warning
  IF v_batch.id IS NULL THEN
    RAISE NOTICE 'No production batch found for WO %. Allowing dispatch for legacy compatibility.', v_wo_id;
    RETURN NEW;
  END IF;
  
  -- Check if dispatch is allowed for this batch
  IF NOT v_batch.dispatch_allowed THEN
    -- Build detailed error message
    IF v_batch.qc_material_status NOT IN ('passed', 'waived') THEN
      RAISE EXCEPTION 'Dispatch blocked: Material QC not approved for Batch #%. Current status: %', 
        v_batch.batch_number, v_batch.qc_material_status;
    ELSIF v_batch.qc_first_piece_status NOT IN ('passed', 'waived') THEN
      RAISE EXCEPTION 'Dispatch blocked: First Piece QC not approved for Batch #%. Current status: %', 
        v_batch.batch_number, v_batch.qc_first_piece_status;
    ELSIF v_batch.qc_final_status NOT IN ('passed', 'waived') THEN
      RAISE EXCEPTION 'Dispatch blocked: Final QC not approved for Batch #%. Current status: %', 
        v_batch.batch_number, v_batch.qc_final_status;
    ELSE
      RAISE EXCEPTION 'Dispatch blocked: QC approval incomplete for Batch #%', v_batch.batch_number;
    END IF;
  END IF;
  
  -- Store the batch_id on the shipment for traceability
  NEW.batch_id := v_batch.id;
  
  -- Set shipped_at timestamp if not already set
  IF NEW.shipped_at IS NULL AND NEW.status = 'shipped' THEN
    NEW.shipped_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to validate dispatch on shipment status change
DROP TRIGGER IF EXISTS validate_batch_dispatch_trigger ON public.shipments;
CREATE TRIGGER validate_batch_dispatch_trigger
BEFORE INSERT OR UPDATE ON public.shipments
FOR EACH ROW
EXECUTE FUNCTION public.validate_batch_dispatch();

-- Add comment for documentation
COMMENT ON FUNCTION public.validate_batch_dispatch IS 'Validates that a batch has all QC approvals before allowing dispatch. Blocks dispatch if Material, First Piece, or Final QC is not passed/waived.';
COMMENT ON COLUMN public.shipments.batch_id IS 'Links shipment to the production batch for traceability. Prevents dispatch without fresh QC approval.';