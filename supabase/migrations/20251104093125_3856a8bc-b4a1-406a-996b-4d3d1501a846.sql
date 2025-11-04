-- The dimension_tolerances table already stores dimensions as JSONB
-- We'll handle dimension names within the JSONB structure in the application code

-- Add columns to hourly_qc_checks to track which binary checks are applicable
ALTER TABLE public.hourly_qc_checks
ADD COLUMN IF NOT EXISTS thread_applicable boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS visual_applicable boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS plating_applicable boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS plating_thickness_applicable boolean DEFAULT false;

-- Update existing records to mark binary checks as applicable if they have values
UPDATE public.hourly_qc_checks
SET 
  thread_applicable = CASE WHEN thread_status IS NOT NULL THEN true ELSE false END,
  visual_applicable = CASE WHEN visual_status IS NOT NULL THEN true ELSE false END,
  plating_applicable = CASE WHEN plating_status IS NOT NULL THEN true ELSE false END,
  plating_thickness_applicable = CASE WHEN plating_thickness_status IS NOT NULL THEN true ELSE false END;