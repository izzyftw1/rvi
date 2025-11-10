-- Add approved_at and approved_by to qc_records if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='qc_records' AND column_name='approved_at') THEN
    ALTER TABLE public.qc_records ADD COLUMN approved_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='qc_records' AND column_name='approved_by') THEN
    ALTER TABLE public.qc_records ADD COLUMN approved_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Ensure qc_measurements has is_within_tolerance calculated correctly
CREATE OR REPLACE FUNCTION public.calculate_qc_tolerance()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_within_tolerance := (NEW.measured_value >= NEW.lower_limit AND NEW.measured_value <= NEW.upper_limit);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_tolerance ON public.qc_measurements;
CREATE TRIGGER trg_calculate_tolerance
  BEFORE INSERT OR UPDATE ON public.qc_measurements
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_qc_tolerance();