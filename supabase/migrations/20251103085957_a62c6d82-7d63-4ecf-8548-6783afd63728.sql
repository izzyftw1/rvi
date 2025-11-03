-- Add 'pending' to qc_result enum
ALTER TYPE qc_result ADD VALUE IF NOT EXISTS 'pending';

-- Update auto_create_qc_incoming to use valid enum value
-- (function already uses 'pending', just needed the enum value added)