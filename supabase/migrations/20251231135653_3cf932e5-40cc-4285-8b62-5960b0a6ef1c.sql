-- Allow Final QC to record up to 20 samples per dimension (matches UI sample size max)
-- Existing constraint only allowed 1..5, causing Final QC submissions (10 samples) to fail.

ALTER TABLE public.qc_measurements
  DROP CONSTRAINT IF EXISTS qc_measurements_sample_number_check;

ALTER TABLE public.qc_measurements
  ADD CONSTRAINT qc_measurements_sample_number_check
  CHECK ((sample_number >= 1) AND (sample_number <= 20));
