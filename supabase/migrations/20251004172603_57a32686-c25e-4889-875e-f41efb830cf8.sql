-- Create enum for operations A-J
CREATE TYPE public.operation_letter AS ENUM ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J');

-- First, backup and clean dimension_tolerances
-- Keep only the most recent record for each item_code
DELETE FROM public.dimension_tolerances a
WHERE a.id NOT IN (
  SELECT DISTINCT ON (item_code) id
  FROM public.dimension_tolerances
  ORDER BY item_code, created_at DESC
);

-- Update dimension_tolerances table
ALTER TABLE public.dimension_tolerances 
DROP COLUMN IF EXISTS operation_no,
DROP COLUMN IF EXISTS dimension_a_min,
DROP COLUMN IF EXISTS dimension_a_max,
DROP COLUMN IF EXISTS dimension_b_min,
DROP COLUMN IF EXISTS dimension_b_max,
DROP COLUMN IF EXISTS dimension_c_min,
DROP COLUMN IF EXISTS dimension_c_max,
DROP COLUMN IF EXISTS dimension_d_min,
DROP COLUMN IF EXISTS dimension_d_max,
DROP COLUMN IF EXISTS dimension_e_min,
DROP COLUMN IF EXISTS dimension_e_max,
DROP COLUMN IF EXISTS dimension_f_min,
DROP COLUMN IF EXISTS dimension_f_max,
DROP COLUMN IF EXISTS dimension_g_min,
DROP COLUMN IF EXISTS dimension_g_max,
ADD COLUMN operation operation_letter NOT NULL DEFAULT 'A',
ADD COLUMN dimensions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Create unique constraint
ALTER TABLE public.dimension_tolerances 
ADD CONSTRAINT dimension_tolerances_item_code_operation_key UNIQUE (item_code, operation);

-- Create index for operation
CREATE INDEX IF NOT EXISTS idx_dimension_tolerances_operation ON public.dimension_tolerances(operation);

-- Update hourly_qc_checks table
ALTER TABLE public.hourly_qc_checks 
DROP COLUMN IF EXISTS operation_no,
DROP COLUMN IF EXISTS dimension_a,
DROP COLUMN IF EXISTS dimension_b,
DROP COLUMN IF EXISTS dimension_c,
DROP COLUMN IF EXISTS dimension_d,
DROP COLUMN IF EXISTS dimension_e,
DROP COLUMN IF EXISTS dimension_f,
DROP COLUMN IF EXISTS dimension_g,
DROP COLUMN IF EXISTS item_code,
ADD COLUMN operation operation_letter NOT NULL DEFAULT 'A',
ADD COLUMN dimensions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Create index for operation
CREATE INDEX IF NOT EXISTS idx_hourly_qc_checks_operation ON public.hourly_qc_checks(operation);

COMMENT ON COLUMN dimension_tolerances.dimensions IS 'Dynamic dimensions stored as {"1": {"min": 10.5, "max": 11.5, "label": "Dimension 1"}, "2": {...}}';
COMMENT ON COLUMN hourly_qc_checks.dimensions IS 'Dynamic dimension measurements stored as {"1": 10.75, "2": 11.2, ...}';