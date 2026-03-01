
-- P0 FIX #50: Auto-complete WO when dispatched_qty >= ordered_qty
-- Trigger fires AFTER INSERT on dispatches, aggregates total dispatched and marks WO complete

CREATE OR REPLACE FUNCTION public.auto_complete_wo_on_dispatch()
RETURNS TRIGGER AS $$
DECLARE
  v_wo_id UUID;
  v_ordered_qty NUMERIC;
  v_total_dispatched NUMERIC;
BEGIN
  v_wo_id := NEW.wo_id;
  
  -- Get ordered quantity
  SELECT quantity INTO v_ordered_qty
  FROM public.work_orders
  WHERE id = v_wo_id;
  
  IF v_ordered_qty IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Sum all dispatched quantities for this WO
  SELECT COALESCE(SUM(quantity), 0) INTO v_total_dispatched
  FROM public.dispatches
  WHERE wo_id = v_wo_id;
  
  -- If dispatched >= ordered, mark WO as completed
  IF v_total_dispatched >= v_ordered_qty THEN
    UPDATE public.work_orders
    SET status = 'completed',
        current_stage = 'dispatched',
        updated_at = NOW()
    WHERE id = v_wo_id
      AND status != 'completed';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_complete_wo_on_dispatch ON public.dispatches;
CREATE TRIGGER trg_auto_complete_wo_on_dispatch
  AFTER INSERT ON public.dispatches
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_complete_wo_on_dispatch();

-- P1 FIX #13: Stage transition validation function (enforced in frontend, available as DB function too)
CREATE OR REPLACE FUNCTION public.validate_stage_transition(
  p_current_stage TEXT,
  p_new_stage TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  -- Define valid transitions
  RETURN CASE
    WHEN p_current_stage = 'pending' AND p_new_stage IN ('cutting', 'forging', 'production', 'external') THEN TRUE
    WHEN p_current_stage = 'cutting' AND p_new_stage IN ('forging', 'production', 'external') THEN TRUE
    WHEN p_current_stage = 'forging' AND p_new_stage IN ('production', 'external', 'cutting') THEN TRUE
    WHEN p_current_stage = 'production' AND p_new_stage IN ('qc', 'external', 'packing') THEN TRUE
    WHEN p_current_stage = 'external' AND p_new_stage IN ('production', 'qc') THEN TRUE
    WHEN p_current_stage = 'qc' AND p_new_stage IN ('production', 'packing', 'external') THEN TRUE
    WHEN p_current_stage = 'packing' AND p_new_stage IN ('dispatched', 'qc') THEN TRUE
    WHEN p_current_stage = 'dispatched' AND p_new_stage = 'completed' THEN TRUE
    -- Admin override: allow any transition for flexibility
    ELSE FALSE
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
