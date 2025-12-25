-- STEP 1: Drop duplicate triggers (keep only one)
DROP TRIGGER IF EXISTS trigger_auto_generate_wo_number ON work_orders;
DROP TRIGGER IF EXISTS set_wo_number_trigger ON work_orders;

-- STEP 2: Create single authoritative function
CREATE OR REPLACE FUNCTION public.trigger_set_wo_number()
RETURNS TRIGGER AS $$
BEGIN
  -- ALWAYS generate wo_number - never trust client input
  -- This ensures atomic, server-side generation
  NEW.wo_number := generate_wo_number();
  
  -- Also set display_id to match for consistency
  NEW.display_id := NEW.wo_number;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- STEP 3: Create single BEFORE INSERT trigger
CREATE TRIGGER set_wo_number_trigger
  BEFORE INSERT ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_wo_number();

-- STEP 4: Add immutability trigger - prevent wo_number changes after creation
CREATE OR REPLACE FUNCTION public.prevent_wo_number_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.wo_number IS NOT NULL AND NEW.wo_number IS DISTINCT FROM OLD.wo_number THEN
    RAISE EXCEPTION 'wo_number is immutable and cannot be changed after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the immutability trigger
DROP TRIGGER IF EXISTS prevent_wo_number_change_trigger ON work_orders;
CREATE TRIGGER prevent_wo_number_change_trigger
  BEFORE UPDATE ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION prevent_wo_number_change();