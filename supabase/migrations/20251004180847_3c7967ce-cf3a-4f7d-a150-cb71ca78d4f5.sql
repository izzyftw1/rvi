-- Add binary QC check columns to hourly_qc_checks table
ALTER TABLE public.hourly_qc_checks
ADD COLUMN thread_status text CHECK (thread_status IN ('OK', 'Not OK')),
ADD COLUMN visual_status text CHECK (visual_status IN ('OK', 'Not OK')),
ADD COLUMN plating_status text CHECK (plating_status IN ('OK', 'Not OK')),
ADD COLUMN plating_thickness_status text CHECK (plating_thickness_status IN ('OK', 'Not OK'));