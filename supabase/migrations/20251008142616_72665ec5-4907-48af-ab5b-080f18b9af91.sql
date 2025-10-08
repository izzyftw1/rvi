-- Fix search_path for security definer functions
CREATE OR REPLACE FUNCTION set_material_qc_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE work_orders
  SET material_qc_status = 'pending'
  WHERE id = NEW.wo_id
  AND material_qc_status = 'not_required';
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION set_first_piece_qc_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE work_orders
  SET first_piece_qc_status = 'pending'
  WHERE id = NEW.wo_id
  AND first_piece_qc_status = 'not_required';
  
  RETURN NEW;
END;
$$;