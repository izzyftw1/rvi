-- Add 'incoming' to qc_type enum for material incoming QC
ALTER TYPE qc_type ADD VALUE IF NOT EXISTS 'incoming';