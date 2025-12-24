-- Add columns for tracking external return QC requirement
ALTER TABLE public.production_batches 
ADD COLUMN IF NOT EXISTS requires_qc_on_return BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS external_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS external_returned_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS post_external_qc_status TEXT DEFAULT 'pending';

-- Add index for QC queries
CREATE INDEX IF NOT EXISTS idx_production_batches_qc_status 
ON public.production_batches (wo_id, qc_material_status, qc_first_piece_status, qc_final_status);

-- Create function to reset QC status when batch returns from external processing
CREATE OR REPLACE FUNCTION reset_batch_qc_on_external_return()
RETURNS TRIGGER AS $$
BEGIN
  -- When a batch moves from 'external' stage to another stage (returned)
  IF OLD.stage_type = 'external' AND NEW.stage_type != 'external' THEN
    -- Mark that this batch requires QC after external return
    NEW.requires_qc_on_return := true;
    NEW.external_returned_at := NOW();
    -- Reset post-external QC status to pending
    NEW.post_external_qc_status := 'pending';
    -- Note: We do NOT reset qc_first_piece or qc_final as those are for fresh batches
    -- The post_external_qc_status tracks the QC needed after external processing
  END IF;
  
  -- When a batch is sent to external processing
  IF NEW.stage_type = 'external' AND OLD.stage_type != 'external' THEN
    NEW.external_sent_at := NOW();
    NEW.requires_qc_on_return := false;
    NEW.external_returned_at := NULL;
    NEW.post_external_qc_status := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for external return QC reset
DROP TRIGGER IF EXISTS trigger_batch_external_return_qc ON public.production_batches;
CREATE TRIGGER trigger_batch_external_return_qc
  BEFORE UPDATE ON public.production_batches
  FOR EACH ROW
  EXECUTE FUNCTION reset_batch_qc_on_external_return();

-- Add comment for documentation
COMMENT ON COLUMN public.production_batches.requires_qc_on_return IS 'True when batch has returned from external processing and needs QC';
COMMENT ON COLUMN public.production_batches.post_external_qc_status IS 'QC status after external processing return: pending, passed, failed';