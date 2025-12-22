-- Add machine_id column to ncrs table for direct machine linking
ALTER TABLE public.ncrs 
ADD COLUMN IF NOT EXISTS machine_id uuid REFERENCES public.machines(id);

-- Add rejection_type column to capture what type of rejection triggered the NCR
ALTER TABLE public.ncrs 
ADD COLUMN IF NOT EXISTS rejection_type text;

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_ncrs_machine_id ON public.ncrs(machine_id);
CREATE INDEX IF NOT EXISTS idx_ncrs_rejection_type ON public.ncrs(rejection_type);

-- Create a function to get rejection threshold settings (configurable per rejection type)
-- Default threshold is 3 pieces or 2% of total production
CREATE OR REPLACE FUNCTION public.get_rejection_threshold(
  rejection_type text,
  total_production integer DEFAULT 0
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  threshold_pcs integer;
  threshold_pct numeric;
BEGIN
  -- Default thresholds (can be made configurable via a settings table later)
  threshold_pcs := 3;  -- Minimum pieces to trigger NCR prompt
  threshold_pct := 2.0; -- Percentage of production
  
  -- Calculate threshold based on total production
  IF total_production > 0 THEN
    RETURN GREATEST(threshold_pcs, CEIL(total_production * threshold_pct / 100));
  END IF;
  
  RETURN threshold_pcs;
END;
$$;