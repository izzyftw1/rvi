-- Add batch_id to qc_records table
ALTER TABLE public.qc_records
ADD COLUMN batch_id UUID REFERENCES public.production_batches(id);

-- Add batch_id to hourly_qc_checks table
ALTER TABLE public.hourly_qc_checks
ADD COLUMN batch_id UUID REFERENCES public.production_batches(id);

-- Add QC status fields to production_batches for tracking batch-level QC gates
ALTER TABLE public.production_batches
ADD COLUMN qc_material_status TEXT DEFAULT 'pending' CHECK (qc_material_status IN ('pending', 'passed', 'failed', 'waived')),
ADD COLUMN qc_material_approved_by UUID,
ADD COLUMN qc_material_approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN qc_first_piece_status TEXT DEFAULT 'pending' CHECK (qc_first_piece_status IN ('pending', 'passed', 'failed', 'waived')),
ADD COLUMN qc_first_piece_approved_by UUID,
ADD COLUMN qc_first_piece_approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN qc_final_status TEXT DEFAULT 'pending' CHECK (qc_final_status IN ('pending', 'passed', 'failed', 'waived')),
ADD COLUMN qc_final_approved_by UUID,
ADD COLUMN qc_final_approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN production_allowed BOOLEAN DEFAULT false,
ADD COLUMN dispatch_allowed BOOLEAN DEFAULT false;

-- Create indexes for efficient lookups
CREATE INDEX idx_qc_records_batch_id ON public.qc_records(batch_id);
CREATE INDEX idx_hourly_qc_checks_batch_id ON public.hourly_qc_checks(batch_id);
CREATE INDEX idx_production_batches_qc_status ON public.production_batches(qc_material_status, qc_first_piece_status, qc_final_status);

-- Function to update batch QC status when qc_records are updated
CREATE OR REPLACE FUNCTION public.sync_batch_qc_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only process if batch_id is set
  IF NEW.batch_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Update batch QC status based on qc_type
  IF NEW.qc_type = 'incoming' OR NEW.qc_type = 'material' THEN
    UPDATE production_batches
    SET 
      qc_material_status = NEW.result,
      qc_material_approved_by = NEW.approved_by,
      qc_material_approved_at = CASE WHEN NEW.result IN ('passed', 'failed', 'waived') THEN NOW() ELSE NULL END
    WHERE id = NEW.batch_id;
  ELSIF NEW.qc_type = 'first_piece' THEN
    UPDATE production_batches
    SET 
      qc_first_piece_status = NEW.result,
      qc_first_piece_approved_by = NEW.approved_by,
      qc_first_piece_approved_at = CASE WHEN NEW.result IN ('passed', 'failed', 'waived') THEN NOW() ELSE NULL END
    WHERE id = NEW.batch_id;
  ELSIF NEW.qc_type = 'final' THEN
    UPDATE production_batches
    SET 
      qc_final_status = NEW.result,
      qc_final_approved_by = NEW.approved_by,
      qc_final_approved_at = CASE WHEN NEW.result IN ('passed', 'failed', 'waived') THEN NOW() ELSE NULL END
    WHERE id = NEW.batch_id;
  END IF;
  
  -- Update production_allowed flag (requires material + first piece passed)
  UPDATE production_batches
  SET production_allowed = (
    qc_material_status IN ('passed', 'waived') AND
    qc_first_piece_status IN ('passed', 'waived')
  )
  WHERE id = NEW.batch_id;
  
  -- Update dispatch_allowed flag (requires all QC passed)
  UPDATE production_batches
  SET dispatch_allowed = (
    qc_material_status IN ('passed', 'waived') AND
    qc_first_piece_status IN ('passed', 'waived') AND
    qc_final_status IN ('passed', 'waived')
  )
  WHERE id = NEW.batch_id;
  
  RETURN NEW;
END;
$$;

-- Create trigger to sync batch QC status
DROP TRIGGER IF EXISTS sync_batch_qc_status_trigger ON public.qc_records;
CREATE TRIGGER sync_batch_qc_status_trigger
AFTER INSERT OR UPDATE ON public.qc_records
FOR EACH ROW
EXECUTE FUNCTION public.sync_batch_qc_status();

-- Function to get current batch for QC operations
CREATE OR REPLACE FUNCTION public.get_current_batch_for_qc(p_wo_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID;
BEGIN
  -- Get the latest active batch (no ended_at) or most recent batch
  SELECT id INTO v_batch_id
  FROM production_batches
  WHERE wo_id = p_wo_id
  ORDER BY ended_at NULLS FIRST, batch_number DESC
  LIMIT 1;
  
  RETURN v_batch_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_current_batch_for_qc(UUID) TO authenticated;

-- Add comments for documentation
COMMENT ON COLUMN public.production_batches.qc_material_status IS 'Material QC status for this batch: pending, passed, failed, waived';
COMMENT ON COLUMN public.production_batches.qc_first_piece_status IS 'First piece QC status for this batch: pending, passed, failed, waived';
COMMENT ON COLUMN public.production_batches.qc_final_status IS 'Final QC status for this batch: pending, passed, failed, waived';
COMMENT ON COLUMN public.production_batches.production_allowed IS 'True when material + first piece QC passed for this batch';
COMMENT ON COLUMN public.production_batches.dispatch_allowed IS 'True when all QC gates passed for this batch';