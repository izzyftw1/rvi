
-- Create function to auto-link material lot to NCR if not provided
CREATE OR REPLACE FUNCTION public.auto_link_ncr_material_lot()
RETURNS TRIGGER AS $$
DECLARE
  v_lot_id uuid;
BEGIN
  -- Only try to auto-link if material_lot_id is null and work_order_id exists
  IF NEW.material_lot_id IS NULL AND NEW.work_order_id IS NOT NULL THEN
    -- Get the most recent material lot issued to this work order
    SELECT ml.id INTO v_lot_id
    FROM wo_material_issues wmi
    JOIN material_lots ml ON wmi.lot_id = ml.id
    WHERE wmi.wo_id = NEW.work_order_id
    ORDER BY wmi.issued_at DESC
    LIMIT 1;
    
    IF v_lot_id IS NOT NULL THEN
      NEW.material_lot_id := v_lot_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-link material lot on insert
DROP TRIGGER IF EXISTS trg_ncr_auto_link_material_lot ON public.ncrs;
CREATE TRIGGER trg_ncr_auto_link_material_lot
  BEFORE INSERT ON public.ncrs
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_ncr_material_lot();

-- Update existing NCRs without material_lot_id if possible
UPDATE ncrs n
SET material_lot_id = (
  SELECT ml.id
  FROM wo_material_issues wmi
  JOIN material_lots ml ON wmi.lot_id = ml.id
  WHERE wmi.wo_id = n.work_order_id
  ORDER BY wmi.issued_at DESC
  LIMIT 1
)
WHERE n.material_lot_id IS NULL 
AND n.work_order_id IS NOT NULL
AND EXISTS (
  SELECT 1 FROM wo_material_issues wmi WHERE wmi.wo_id = n.work_order_id
);
