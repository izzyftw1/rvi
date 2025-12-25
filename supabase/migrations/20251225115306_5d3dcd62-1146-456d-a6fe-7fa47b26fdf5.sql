-- Create trigger function to auto-set wo_number on INSERT
CREATE OR REPLACE FUNCTION trigger_set_wo_number()
RETURNS TRIGGER AS $$
BEGIN
  -- Only generate if wo_number is not provided or is empty
  IF NEW.wo_number IS NULL OR NEW.wo_number = '' THEN
    NEW.wo_number := generate_wo_number();
  END IF;
  
  -- Also set display_id if not provided
  IF NEW.display_id IS NULL OR NEW.display_id = '' THEN
    NEW.display_id := NEW.wo_number;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the BEFORE INSERT trigger
DROP TRIGGER IF EXISTS set_wo_number_trigger ON work_orders;
CREATE TRIGGER set_wo_number_trigger
  BEFORE INSERT ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_wo_number();