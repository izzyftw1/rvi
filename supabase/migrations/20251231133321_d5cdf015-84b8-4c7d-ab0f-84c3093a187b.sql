-- Fix sync_wo_from_batches to not update GENERATED columns (completion_pct, qty_remaining)
-- These columns are now auto-computed by PostgreSQL and cannot be manually updated

CREATE OR REPLACE FUNCTION public.sync_wo_from_batches()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wo_id UUID;
  v_total_completed INTEGER;
  v_total_rejected INTEGER;
  v_total_dispatched INTEGER;
BEGIN
  -- Get the work order ID
  v_wo_id := COALESCE(NEW.wo_id, OLD.wo_id);
  
  IF v_wo_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Calculate totals from all batches for this work order
  SELECT 
    COALESCE(SUM(produced_qty), 0),
    COALESCE(SUM(qc_rejected_qty), 0),
    COALESCE(SUM(dispatched_qty), 0)
  INTO v_total_completed, v_total_rejected, v_total_dispatched
  FROM production_batches
  WHERE wo_id = v_wo_id;
  
  -- Update work order with aggregated values
  -- NOTE: completion_pct and qty_remaining are GENERATED ALWAYS columns
  -- They will be auto-computed based on qty_completed and quantity
  UPDATE work_orders
  SET 
    qty_completed = v_total_completed,
    qty_rejected = v_total_rejected,
    qty_dispatched = v_total_dispatched,
    updated_at = NOW()
  WHERE id = v_wo_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;