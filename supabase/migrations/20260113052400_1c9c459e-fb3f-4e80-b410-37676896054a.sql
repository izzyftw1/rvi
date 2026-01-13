-- Add HOURLY_QC to ncr_type enum
ALTER TYPE ncr_type ADD VALUE IF NOT EXISTS 'HOURLY_QC';

-- Also add 'hourly_qc' to the raised_from options (this is already a text field so no migration needed)
-- The raised_from column can accept any text value