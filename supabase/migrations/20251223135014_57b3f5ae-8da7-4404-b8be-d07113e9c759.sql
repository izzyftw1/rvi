-- Add progress tracking columns to work_orders (cached from daily_production_logs)
ALTER TABLE public.work_orders 
ADD COLUMN IF NOT EXISTS qty_completed INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS qty_rejected INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS qty_remaining INTEGER GENERATED ALWAYS AS (GREATEST(quantity - qty_completed, 0)) STORED,
ADD COLUMN IF NOT EXISTS completion_pct NUMERIC(5,2) GENERATED ALWAYS AS (
  CASE WHEN quantity > 0 THEN ROUND((qty_completed * 100.0 / quantity), 2) ELSE 0 END
) STORED;

-- Create function to sync work order progress from production logs
CREATE OR REPLACE FUNCTION public.sync_wo_progress_from_logs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wo_id UUID;
  v_total_ok INTEGER;
  v_total_rejected INTEGER;
BEGIN
  -- Determine which work order to update
  IF TG_OP = 'DELETE' THEN
    v_wo_id := OLD.wo_id;
  ELSE
    v_wo_id := NEW.wo_id;
  END IF;

  -- Skip if no work order linked
  IF v_wo_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Calculate aggregates from all production logs for this WO
  SELECT 
    COALESCE(SUM(ok_quantity), 0)::INTEGER,
    COALESCE(SUM(total_rejection_quantity), 0)::INTEGER
  INTO v_total_ok, v_total_rejected
  FROM public.daily_production_logs
  WHERE wo_id = v_wo_id;

  -- Update the work order with cached values
  UPDATE public.work_orders
  SET 
    qty_completed = v_total_ok,
    qty_rejected = v_total_rejected,
    updated_at = now()
  WHERE id = v_wo_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Create trigger on daily_production_logs
DROP TRIGGER IF EXISTS trg_sync_wo_progress ON public.daily_production_logs;
CREATE TRIGGER trg_sync_wo_progress
AFTER INSERT OR UPDATE OR DELETE ON public.daily_production_logs
FOR EACH ROW
EXECUTE FUNCTION public.sync_wo_progress_from_logs();

-- Backfill existing data
UPDATE public.work_orders wo
SET 
  qty_completed = COALESCE(agg.ok_qty, 0),
  qty_rejected = COALESCE(agg.rejected_qty, 0)
FROM (
  SELECT 
    wo_id,
    SUM(ok_quantity)::INTEGER as ok_qty,
    SUM(total_rejection_quantity)::INTEGER as rejected_qty
  FROM public.daily_production_logs
  WHERE wo_id IS NOT NULL
  GROUP BY wo_id
) agg
WHERE wo.id = agg.wo_id;