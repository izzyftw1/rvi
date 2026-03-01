
-- =====================================================
-- P0 FIX #1: Repair broken validate_receipt_quantity trigger
-- The trigger references qty_sent/qty_received but actual columns
-- are quantity_sent/quantity_received
-- =====================================================
CREATE OR REPLACE FUNCTION public.validate_receipt_quantity()
RETURNS TRIGGER AS $$
DECLARE
  v_qty_sent NUMERIC;
  v_qty_already_received NUMERIC;
  v_max_receivable NUMERIC;
BEGIN
  -- Get the quantity sent from the move record (correct column: quantity_sent)
  SELECT quantity_sent INTO v_qty_sent
  FROM public.wo_external_moves
  WHERE id = NEW.move_id;
  
  IF v_qty_sent IS NULL THEN
    RAISE EXCEPTION 'Invalid move_id: External move record not found';
  END IF;
  
  -- Calculate already received quantity (correct column: quantity_received)
  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(SUM(quantity_received), 0) INTO v_qty_already_received
    FROM public.wo_external_receipts
    WHERE move_id = NEW.move_id AND id != NEW.id;
  ELSE
    SELECT COALESCE(SUM(quantity_received), 0) INTO v_qty_already_received
    FROM public.wo_external_receipts
    WHERE move_id = NEW.move_id;
  END IF;
  
  v_max_receivable := v_qty_sent - v_qty_already_received;
  
  -- Validate the new quantity doesn't exceed max receivable
  IF NEW.quantity_received > v_max_receivable THEN
    RAISE EXCEPTION 'Receipt quantity (%) exceeds maximum receivable quantity (%). Cannot receive more than was shipped.', NEW.quantity_received, v_max_receivable;
  END IF;
  
  -- Validate quantity is positive
  IF NEW.quantity_received <= 0 THEN
    RAISE EXCEPTION 'Receipt quantity must be greater than 0';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- P0 FIX #2: Add over-send prevention trigger on wo_external_moves
-- Validates that qty being sent doesn't exceed what's actually available
-- available = WO quantity - (already_sent_pending - already_returned)
-- =====================================================
CREATE OR REPLACE FUNCTION public.validate_external_send_qty()
RETURNS TRIGGER AS $$
DECLARE
  v_wo_quantity NUMERIC;
  v_total_pending NUMERIC;
  v_available NUMERIC;
BEGIN
  -- Get work order total quantity
  SELECT quantity INTO v_wo_quantity
  FROM public.work_orders
  WHERE id = NEW.work_order_id;
  
  IF v_wo_quantity IS NULL THEN
    RAISE EXCEPTION 'Work order not found: %', NEW.work_order_id;
  END IF;
  
  -- Calculate total quantity currently out at external (sent minus returned)
  SELECT COALESCE(SUM(quantity_sent - COALESCE(quantity_returned, 0)), 0)
  INTO v_total_pending
  FROM public.wo_external_moves
  WHERE work_order_id = NEW.work_order_id
    AND status IN ('sent', 'in_transit', 'partial');
  
  v_available := v_wo_quantity - v_total_pending;
  
  -- Hard block if send qty exceeds available
  IF NEW.quantity_sent > v_available THEN
    RAISE EXCEPTION 'Cannot send % pcs. Only % pcs available (WO qty: %, currently external: %)',
      NEW.quantity_sent, v_available, v_wo_quantity, v_total_pending;
  END IF;
  
  -- Validate quantity is positive
  IF NEW.quantity_sent <= 0 THEN
    RAISE EXCEPTION 'Send quantity must be greater than 0';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger (drop first if exists)
DROP TRIGGER IF EXISTS trg_validate_external_send_qty ON public.wo_external_moves;
CREATE TRIGGER trg_validate_external_send_qty
  BEFORE INSERT ON public.wo_external_moves
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_external_send_qty();

-- =====================================================
-- P1 FIX: Add batch_id column to wo_external_moves for traceability
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wo_external_moves' AND column_name = 'batch_id' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.wo_external_moves ADD COLUMN batch_id UUID REFERENCES public.production_batches(id);
  END IF;
END $$;

-- =====================================================
-- P1 FIX: Update sync_wo_on_external_move to also handle 'received' status
-- and properly sync qty_external_wip from aggregated moves
-- =====================================================
CREATE OR REPLACE FUNCTION public.sync_wo_on_external_move()
RETURNS TRIGGER AS $$
DECLARE
  v_total_sent NUMERIC;
  v_total_returned NUMERIC;
  v_wip NUMERIC;
  v_partner_name TEXT;
BEGIN
  -- Calculate totals for ALL moves of this WO (not just one process)
  SELECT 
    COALESCE(SUM(quantity_sent), 0),
    COALESCE(SUM(COALESCE(quantity_returned, 0)), 0)
  INTO v_total_sent, v_total_returned
  FROM public.wo_external_moves
  WHERE work_order_id = NEW.work_order_id;

  v_wip := GREATEST(0, v_total_sent - v_total_returned);

  -- Get partner name
  SELECT name INTO v_partner_name
  FROM public.external_partners
  WHERE id = NEW.partner_id;

  -- Update work_order with aggregated WIP
  UPDATE public.work_orders
  SET 
    qty_external_wip = v_wip,
    external_status = CASE 
      WHEN v_wip = 0 THEN NULL
      WHEN v_total_returned > 0 AND v_wip > 0 THEN 'partial'
      ELSE 'sent'
    END,
    external_process_type = CASE WHEN v_wip > 0 THEN NEW.process ELSE NULL END,
    material_location = CASE 
      WHEN v_wip = 0 THEN 'Factory'
      ELSE COALESCE(v_partner_name, 'External Partner')
    END,
    updated_at = now()
  WHERE id = NEW.work_order_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger fires on both INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_sync_wo_on_external_move ON public.wo_external_moves;
CREATE TRIGGER trg_sync_wo_on_external_move
  AFTER INSERT OR UPDATE ON public.wo_external_moves
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_wo_on_external_move();
