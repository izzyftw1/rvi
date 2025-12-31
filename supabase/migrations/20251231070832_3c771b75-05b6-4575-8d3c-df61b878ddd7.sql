-- Add avg_weight_per_pc column for PCS estimation audit trail
ALTER TABLE public.gate_register
ADD COLUMN IF NOT EXISTS avg_weight_per_pc numeric NULL;

-- Add sample_count and sample_weight for calculation record
ALTER TABLE public.gate_register
ADD COLUMN IF NOT EXISTS pcs_sample_count integer NULL;

ALTER TABLE public.gate_register
ADD COLUMN IF NOT EXISTS pcs_sample_weight numeric NULL;

COMMENT ON COLUMN public.gate_register.avg_weight_per_pc IS 'Average weight per piece calculated from sample (sample_weight / sample_count)';
COMMENT ON COLUMN public.gate_register.pcs_sample_count IS 'Number of pieces in sample for PCS estimation';
COMMENT ON COLUMN public.gate_register.pcs_sample_weight IS 'Weight of sample pieces in kg for PCS estimation';