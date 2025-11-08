-- Add QC columns to work_orders
ALTER TABLE public.work_orders 
ADD COLUMN IF NOT EXISTS qc_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS production_locked BOOLEAN DEFAULT false;

-- Create qc_measurements table for storing individual dimension measurements
CREATE TABLE IF NOT EXISTS public.qc_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qc_record_id UUID NOT NULL REFERENCES public.qc_records(id) ON DELETE CASCADE,
  dimension_name TEXT NOT NULL,
  sample_number INTEGER NOT NULL CHECK (sample_number >= 1 AND sample_number <= 5),
  measured_value NUMERIC NOT NULL,
  lower_limit NUMERIC NOT NULL,
  upper_limit NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  is_within_tolerance BOOLEAN GENERATED ALWAYS AS (measured_value >= lower_limit AND measured_value <= upper_limit) STORED,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_qc_measurements_qc_record ON public.qc_measurements(qc_record_id);
CREATE INDEX IF NOT EXISTS idx_qc_measurements_dimension ON public.qc_measurements(dimension_name);

-- Enable RLS
ALTER TABLE public.qc_measurements ENABLE ROW LEVEL SECURITY;

-- RLS policies for qc_measurements
CREATE POLICY "Anyone can view QC measurements"
  ON public.qc_measurements FOR SELECT
  USING (true);

CREATE POLICY "Quality users can create QC measurements"
  ON public.qc_measurements FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'quality') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Quality users can update QC measurements"
  ON public.qc_measurements FOR UPDATE
  USING (has_role(auth.uid(), 'quality') OR has_role(auth.uid(), 'admin'));

-- Function to auto-create QC records at various gates
CREATE OR REPLACE FUNCTION public.auto_create_qc_gate()
RETURNS TRIGGER AS $$
DECLARE
  qc_id_prefix TEXT;
  qc_count INTEGER;
  new_qc_id TEXT;
BEGIN
  -- Material QC on Goods In (when material is issued)
  IF TG_TABLE_NAME = 'wo_material_issues' THEN
    SELECT COUNT(*) INTO qc_count FROM qc_records WHERE qc_type = 'incoming';
    new_qc_id := 'QC-MAT-' || LPAD((qc_count + 1)::text, 6, '0');
    
    INSERT INTO public.qc_records (qc_id, wo_id, qc_type, result, remarks)
    VALUES (new_qc_id, NEW.wo_id, 'incoming', 'pending', 'Auto-generated Material QC gate')
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- First Piece QC when WO moves to production
  IF TG_TABLE_NAME = 'work_orders' AND NEW.current_stage = 'production' AND OLD.current_stage != 'production' THEN
    SELECT COUNT(*) INTO qc_count FROM qc_records WHERE qc_type = 'first_piece';
    new_qc_id := 'QC-FP-' || LPAD((qc_count + 1)::text, 6, '0');
    
    INSERT INTO public.qc_records (qc_id, wo_id, qc_type, result, remarks)
    VALUES (new_qc_id, NEW.id, 'first_piece', 'pending', 'Auto-generated First Piece QC gate')
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Final QC when production completes
  IF TG_TABLE_NAME = 'work_orders' AND NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    SELECT COUNT(*) INTO qc_count FROM qc_records WHERE qc_type = 'final';
    new_qc_id := 'QC-FINAL-' || LPAD((qc_count + 1)::text, 6, '0');
    
    INSERT INTO public.qc_records (qc_id, wo_id, qc_type, result, remarks)
    VALUES (new_qc_id, NEW.id, 'final', 'pending', 'Auto-generated Final QC gate')
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Triggers for auto-creating QC gates
DROP TRIGGER IF EXISTS trigger_auto_qc_material ON public.wo_material_issues;
CREATE TRIGGER trigger_auto_qc_material
  AFTER INSERT ON public.wo_material_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_qc_gate();

DROP TRIGGER IF EXISTS trigger_auto_qc_production ON public.work_orders;
CREATE TRIGGER trigger_auto_qc_production
  AFTER UPDATE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_qc_gate();

-- Function to update work order QC status and lock production
CREATE OR REPLACE FUNCTION public.update_wo_qc_status()
RETURNS TRIGGER AS $$
BEGIN
  -- If QC failed, lock production
  IF NEW.result = 'failed' THEN
    UPDATE public.work_orders
    SET qc_status = 'failed',
        production_locked = true,
        updated_at = now()
    WHERE id = NEW.wo_id;
  -- If QC passed, approve and unlock
  ELSIF NEW.result = 'passed' THEN
    UPDATE public.work_orders
    SET qc_status = 'approved',
        production_locked = false,
        updated_at = now()
    WHERE id = NEW.wo_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to update work order on QC completion
DROP TRIGGER IF EXISTS trigger_update_wo_qc ON public.qc_records;
CREATE TRIGGER trigger_update_wo_qc
  AFTER UPDATE ON public.qc_records
  FOR EACH ROW
  WHEN (NEW.result IS DISTINCT FROM OLD.result)
  EXECUTE FUNCTION public.update_wo_qc_status();

-- Enable realtime for qc_measurements
ALTER PUBLICATION supabase_realtime ADD TABLE public.qc_measurements;