-- Create enum types for QC statuses
CREATE TYPE material_qc_status AS ENUM ('not_required', 'pending', 'passed', 'failed');
CREATE TYPE first_piece_qc_status AS ENUM ('not_required', 'pending', 'approved', 'failed');

-- Add QC gate columns to work_orders table
ALTER TABLE work_orders
ADD COLUMN material_qc_status material_qc_status DEFAULT 'not_required',
ADD COLUMN material_qc_approved_by uuid REFERENCES auth.users(id),
ADD COLUMN material_qc_approved_at timestamp with time zone,
ADD COLUMN material_qc_remarks text,
ADD COLUMN first_piece_qc_status first_piece_qc_status DEFAULT 'not_required',
ADD COLUMN first_piece_qc_approved_by uuid REFERENCES auth.users(id),
ADD COLUMN first_piece_qc_approved_at timestamp with time zone,
ADD COLUMN first_piece_qc_remarks text,
ADD COLUMN first_piece_ready_for_qc boolean DEFAULT false,
ADD COLUMN first_piece_flagged_by uuid REFERENCES auth.users(id),
ADD COLUMN first_piece_flagged_at timestamp with time zone;

-- Update trigger to set material QC status to pending when material is issued
CREATE OR REPLACE FUNCTION set_material_qc_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When material is issued to a WO, set material QC to pending
  UPDATE work_orders
  SET material_qc_status = 'pending'
  WHERE id = NEW.wo_id
  AND material_qc_status = 'not_required';
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_set_material_qc_pending
AFTER INSERT ON material_issues
FOR EACH ROW
EXECUTE FUNCTION set_material_qc_pending();

-- Update trigger to set first piece QC to pending when machine is assigned
CREATE OR REPLACE FUNCTION set_first_piece_qc_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When machine is assigned to a WO, set first piece QC to pending
  UPDATE work_orders
  SET first_piece_qc_status = 'pending'
  WHERE id = NEW.wo_id
  AND first_piece_qc_status = 'not_required';
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_set_first_piece_qc_pending
AFTER INSERT ON wo_machine_assignments
FOR EACH ROW
EXECUTE FUNCTION set_first_piece_qc_pending();