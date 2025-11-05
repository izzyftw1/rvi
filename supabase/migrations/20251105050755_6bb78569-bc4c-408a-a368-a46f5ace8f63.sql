-- Function to auto-create cutting/forging records when work order is created or updated
CREATE OR REPLACE FUNCTION auto_create_cutting_forging_records()
RETURNS TRIGGER AS $$
BEGIN
  -- Create cutting record if cutting_required is true and no record exists
  IF NEW.cutting_required = true THEN
    INSERT INTO cutting_records (
      work_order_id,
      item_code,
      qty_required,
      qty_cut,
      status
    )
    SELECT
      NEW.id,
      NEW.item_code,
      NEW.quantity,
      0,
      'pending'
    WHERE NOT EXISTS (
      SELECT 1 FROM cutting_records WHERE work_order_id = NEW.id
    );
  END IF;

  -- Create forging record if forging_required is true and no record exists
  IF NEW.forging_required = true THEN
    INSERT INTO forging_records (
      work_order_id,
      qty_required,
      qty_forged,
      status,
      sample_sent,
      qc_approved
    )
    SELECT
      NEW.id,
      NEW.quantity,
      0,
      'pending',
      false,
      false
    WHERE NOT EXISTS (
      SELECT 1 FROM forging_records WHERE work_order_id = NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-creating cutting/forging records
DROP TRIGGER IF EXISTS trigger_auto_create_cutting_forging ON work_orders;
CREATE TRIGGER trigger_auto_create_cutting_forging
  AFTER INSERT OR UPDATE OF cutting_required, forging_required
  ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_cutting_forging_records();