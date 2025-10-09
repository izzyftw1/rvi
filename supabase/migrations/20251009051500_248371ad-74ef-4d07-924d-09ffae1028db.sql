-- Refactor QC gates to use boolean fields instead of enums

-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_set_material_qc_pending ON material_issues;
DROP TRIGGER IF EXISTS trigger_set_first_piece_qc_pending ON wo_machine_assignments;

-- Drop functions
DROP FUNCTION IF EXISTS set_material_qc_pending() CASCADE;
DROP FUNCTION IF EXISTS set_first_piece_qc_pending() CASCADE;

-- Drop existing enum-based columns
ALTER TABLE work_orders 
  DROP COLUMN IF EXISTS material_qc_status CASCADE,
  DROP COLUMN IF EXISTS material_qc_approved_by,
  DROP COLUMN IF EXISTS material_qc_approved_at,
  DROP COLUMN IF EXISTS material_qc_remarks,
  DROP COLUMN IF EXISTS first_piece_qc_status CASCADE,
  DROP COLUMN IF EXISTS first_piece_qc_approved_by,
  DROP COLUMN IF EXISTS first_piece_qc_approved_at,
  DROP COLUMN IF EXISTS first_piece_qc_remarks,
  DROP COLUMN IF EXISTS first_piece_ready_for_qc,
  DROP COLUMN IF EXISTS first_piece_flagged_by,
  DROP COLUMN IF EXISTS first_piece_flagged_at;

-- Drop the enum types
DROP TYPE IF EXISTS qc_gate_status CASCADE;
DROP TYPE IF EXISTS material_qc_gate_status CASCADE;
DROP TYPE IF EXISTS first_piece_qc_gate_status CASCADE;

-- Add new boolean fields
ALTER TABLE work_orders
  ADD COLUMN qc_material_passed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN qc_first_piece_passed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN qc_material_approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN qc_material_approved_at TIMESTAMPTZ,
  ADD COLUMN qc_first_piece_approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN qc_first_piece_approved_at TIMESTAMPTZ;