
-- Create function to auto-populate cycle_time_seconds from item_master
CREATE OR REPLACE FUNCTION public.populate_wo_cycle_time()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_cycle_time NUMERIC;
BEGIN
  -- Only populate if cycle_time_seconds is not already set
  IF NEW.cycle_time_seconds IS NULL AND NEW.item_code IS NOT NULL THEN
    -- First try cycle_time_seconds, then estimated_cycle_time_s from item_master
    SELECT COALESCE(cycle_time_seconds, estimated_cycle_time_s)
    INTO item_cycle_time
    FROM item_master
    WHERE item_code = NEW.item_code
    LIMIT 1;
    
    IF item_cycle_time IS NOT NULL THEN
      NEW.cycle_time_seconds := item_cycle_time;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to run before insert on work_orders
DROP TRIGGER IF EXISTS populate_wo_cycle_time_trigger ON work_orders;
CREATE TRIGGER populate_wo_cycle_time_trigger
  BEFORE INSERT ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION populate_wo_cycle_time();

-- Also run on update if item_code changes
DROP TRIGGER IF EXISTS populate_wo_cycle_time_on_update_trigger ON work_orders;
CREATE TRIGGER populate_wo_cycle_time_on_update_trigger
  BEFORE UPDATE ON work_orders
  FOR EACH ROW
  WHEN (OLD.item_code IS DISTINCT FROM NEW.item_code AND NEW.cycle_time_seconds IS NULL)
  EXECUTE FUNCTION populate_wo_cycle_time();

-- Backfill existing work orders with missing cycle_time_seconds
UPDATE work_orders wo
SET cycle_time_seconds = COALESCE(im.cycle_time_seconds, im.estimated_cycle_time_s)
FROM item_master im
WHERE wo.item_code = im.item_code
  AND wo.cycle_time_seconds IS NULL
  AND COALESCE(im.cycle_time_seconds, im.estimated_cycle_time_s) IS NOT NULL;

-- Add comment for documentation
COMMENT ON FUNCTION public.populate_wo_cycle_time() IS 
'Auto-populates cycle_time_seconds on work_orders from item_master defaults. 
Cycle time is critical for target quantity calculations, efficiency metrics, and scheduling across all departments.';
