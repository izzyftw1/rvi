-- Ensure qc_records table has all necessary fields
ALTER TABLE public.qc_records
ADD COLUMN IF NOT EXISTS file_upload_url TEXT,
ADD COLUMN IF NOT EXISTS tested_on TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS waive_reason TEXT,
ADD COLUMN IF NOT EXISTS digital_signature JSONB;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_qc_records_wo_stage ON public.qc_records(wo_id, qc_type);
CREATE INDEX IF NOT EXISTS idx_qc_records_status ON public.qc_records(result);

-- Add QC stage status fields to work_orders if not present
ALTER TABLE public.work_orders
ADD COLUMN IF NOT EXISTS qc_raw_material_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS qc_raw_material_approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS qc_raw_material_approved_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS qc_raw_material_remarks TEXT,
ADD COLUMN IF NOT EXISTS qc_first_piece_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS qc_first_piece_approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS qc_first_piece_approved_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS qc_first_piece_remarks TEXT,
ADD COLUMN IF NOT EXISTS qc_final_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS qc_final_approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS qc_final_approved_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS qc_final_remarks TEXT,
ADD COLUMN IF NOT EXISTS production_locked BOOLEAN DEFAULT false;

-- Function to auto-update work_order QC status when qc_records change
CREATE OR REPLACE FUNCTION sync_wo_qc_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Update work order based on qc_type
  IF NEW.qc_type = 'incoming' THEN
    UPDATE public.work_orders
    SET 
      qc_raw_material_status = NEW.result,
      qc_raw_material_approved_at = NEW.approved_at,
      qc_raw_material_approved_by = NEW.approved_by,
      qc_raw_material_remarks = NEW.remarks,
      production_locked = CASE 
        WHEN NEW.result IN ('passed', 'waived') THEN false 
        ELSE true 
      END
    WHERE id = NEW.wo_id;
  ELSIF NEW.qc_type = 'first_piece' THEN
    UPDATE public.work_orders
    SET 
      qc_first_piece_status = NEW.result,
      qc_first_piece_approved_at = NEW.approved_at,
      qc_first_piece_approved_by = NEW.approved_by,
      qc_first_piece_remarks = NEW.remarks,
      production_locked = CASE 
        WHEN NEW.result IN ('passed', 'waived') THEN false 
        ELSE true 
      END
    WHERE id = NEW.wo_id;
  ELSIF NEW.qc_type = 'final' THEN
    UPDATE public.work_orders
    SET 
      qc_final_status = NEW.result,
      qc_final_approved_at = NEW.approved_at,
      qc_final_approved_by = NEW.approved_by,
      qc_final_remarks = NEW.remarks
    WHERE id = NEW.wo_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for QC status sync
DROP TRIGGER IF EXISTS trigger_sync_wo_qc_status ON public.qc_records;
CREATE TRIGGER trigger_sync_wo_qc_status
  AFTER INSERT OR UPDATE ON public.qc_records
  FOR EACH ROW
  EXECUTE FUNCTION sync_wo_qc_status();

-- Update RLS policies for qc_records
DROP POLICY IF EXISTS "Anyone can view QC records" ON public.qc_records;
CREATE POLICY "Anyone can view QC records"
  ON public.qc_records
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Quality users can manage QC records" ON public.qc_records;
CREATE POLICY "Quality users can manage QC records"
  ON public.qc_records
  FOR ALL
  USING (
    has_role(auth.uid(), 'quality'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );