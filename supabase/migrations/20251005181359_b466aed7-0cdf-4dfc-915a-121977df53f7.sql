-- Create enum for WO stages
CREATE TYPE wo_stage AS ENUM ('goods_in', 'production', 'qc', 'packing', 'dispatch');

-- Add current_stage column to work_orders
ALTER TABLE work_orders 
ADD COLUMN current_stage wo_stage DEFAULT 'goods_in';

-- Set existing WOs to appropriate stage based on status
UPDATE work_orders 
SET current_stage = CASE 
  WHEN status = 'pending' THEN 'goods_in'::wo_stage
  WHEN status = 'in_progress' THEN 'production'::wo_stage
  WHEN status IN ('qc', 'completed') THEN 'qc'::wo_stage
  ELSE 'goods_in'::wo_stage
END;

-- Create function to update WO stage
CREATE OR REPLACE FUNCTION update_wo_stage(
  _wo_id uuid,
  _new_stage wo_stage
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE work_orders
  SET current_stage = _new_stage,
      updated_at = now()
  WHERE id = _wo_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION update_wo_stage TO authenticated;