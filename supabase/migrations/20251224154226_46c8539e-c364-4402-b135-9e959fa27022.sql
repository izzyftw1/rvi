
-- Add production_complete to production_batches for per-batch tracking
ALTER TABLE public.production_batches 
ADD COLUMN IF NOT EXISTS production_complete boolean NOT NULL DEFAULT false;

ALTER TABLE public.production_batches 
ADD COLUMN IF NOT EXISTS production_complete_qty integer DEFAULT 0;

ALTER TABLE public.production_batches 
ADD COLUMN IF NOT EXISTS production_completed_at timestamp with time zone DEFAULT NULL;

ALTER TABLE public.production_batches 
ADD COLUMN IF NOT EXISTS production_completed_by uuid DEFAULT NULL;

ALTER TABLE public.production_batches 
ADD COLUMN IF NOT EXISTS production_complete_reason text DEFAULT NULL;

-- Create function to auto-derive WO production_complete from all batches
CREATE OR REPLACE FUNCTION public.sync_wo_production_complete()
RETURNS TRIGGER AS $$
DECLARE
  v_wo_id uuid;
  v_all_complete boolean;
  v_total_complete_qty integer;
  v_batch_count integer;
  v_complete_batch_count integer;
BEGIN
  -- Get the work order ID
  IF TG_OP = 'DELETE' THEN
    v_wo_id := OLD.wo_id;
  ELSE
    v_wo_id := NEW.wo_id;
  END IF;

  -- Count batches and check if all are complete
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE production_complete = true),
    COALESCE(SUM(production_complete_qty) FILTER (WHERE production_complete = true), 0)
  INTO v_batch_count, v_complete_batch_count, v_total_complete_qty
  FROM production_batches
  WHERE wo_id = v_wo_id;

  -- All batches complete = WO complete (only if there are batches)
  v_all_complete := v_batch_count > 0 AND v_batch_count = v_complete_batch_count;

  -- Update the work order (only if status changed to avoid infinite loops)
  UPDATE work_orders
  SET 
    production_complete = v_all_complete,
    production_complete_qty = v_total_complete_qty
  WHERE id = v_wo_id
  AND (production_complete IS DISTINCT FROM v_all_complete 
       OR production_complete_qty IS DISTINCT FROM v_total_complete_qty);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to sync WO production_complete when batch changes
DROP TRIGGER IF EXISTS trg_sync_wo_production_complete ON public.production_batches;
CREATE TRIGGER trg_sync_wo_production_complete
  AFTER INSERT OR UPDATE OF production_complete, production_complete_qty OR DELETE
  ON public.production_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_wo_production_complete();

-- Initialize existing batches: mark as complete if WO is already marked complete
UPDATE production_batches pb
SET 
  production_complete = true,
  production_complete_qty = pb.produced_qty,
  production_completed_at = wo.production_completed_at,
  production_completed_by = wo.production_completed_by,
  production_complete_reason = wo.production_complete_reason
FROM work_orders wo
WHERE pb.wo_id = wo.id
AND wo.production_complete = true
AND pb.production_complete = false;
