-- Add operation_no to hourly_qc_checks
ALTER TABLE public.hourly_qc_checks
ADD COLUMN operation_no integer NOT NULL DEFAULT 1;

-- Add operation_no to dimension_tolerances
ALTER TABLE public.dimension_tolerances
ADD COLUMN operation_no integer NOT NULL DEFAULT 1;

-- Update unique constraint on dimension_tolerances to include operation_no
ALTER TABLE public.dimension_tolerances
DROP CONSTRAINT IF EXISTS dimension_tolerances_item_code_revision_key;

-- Create new unique constraint with operation_no
ALTER TABLE public.dimension_tolerances
ADD CONSTRAINT dimension_tolerances_item_code_revision_operation_key 
UNIQUE (item_code, revision, operation_no);

-- Add index for better query performance
CREATE INDEX idx_hourly_qc_checks_operation_no ON public.hourly_qc_checks(operation_no);
CREATE INDEX idx_dimension_tolerances_operation_no ON public.dimension_tolerances(operation_no);