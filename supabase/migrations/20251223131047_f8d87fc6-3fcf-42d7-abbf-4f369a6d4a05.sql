-- Create a trigger function to validate receipt quantity doesn't exceed shipped quantity
CREATE OR REPLACE FUNCTION public.validate_receipt_quantity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty_sent INT;
  v_qty_already_received INT;
  v_max_receivable INT;
BEGIN
  -- Get the quantity sent from the move record
  SELECT qty_sent INTO v_qty_sent
  FROM public.wo_external_moves
  WHERE id = NEW.move_id;
  
  IF v_qty_sent IS NULL THEN
    RAISE EXCEPTION 'Invalid move_id: External move record not found';
  END IF;
  
  -- Calculate already received quantity (excluding current record for UPDATE)
  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(SUM(qty_received), 0) INTO v_qty_already_received
    FROM public.wo_external_receipts
    WHERE move_id = NEW.move_id AND id != NEW.id;
  ELSE
    SELECT COALESCE(SUM(qty_received), 0) INTO v_qty_already_received
    FROM public.wo_external_receipts
    WHERE move_id = NEW.move_id;
  END IF;
  
  v_max_receivable := v_qty_sent - v_qty_already_received;
  
  -- Validate the new quantity doesn't exceed max receivable
  IF NEW.qty_received > v_max_receivable THEN
    RAISE EXCEPTION 'Receipt quantity (%) exceeds maximum receivable quantity (%). Cannot receive more than was shipped.', NEW.qty_received, v_max_receivable;
  END IF;
  
  -- Validate quantity is positive
  IF NEW.qty_received <= 0 THEN
    RAISE EXCEPTION 'Receipt quantity must be greater than 0';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger on wo_external_receipts table
DROP TRIGGER IF EXISTS validate_receipt_quantity_trigger ON public.wo_external_receipts;
CREATE TRIGGER validate_receipt_quantity_trigger
  BEFORE INSERT OR UPDATE ON public.wo_external_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_receipt_quantity();

-- Add comment explaining the trigger
COMMENT ON FUNCTION public.validate_receipt_quantity() IS 'Validates that receipt quantity does not exceed the quantity originally shipped in the external move. Provides server-side protection against over-receipts.';