-- Add carton_id (packing batch reference) to dispatches table
ALTER TABLE public.dispatches 
ADD COLUMN IF NOT EXISTS carton_id uuid REFERENCES public.cartons(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_dispatches_carton_id ON public.dispatches(carton_id);

-- Add dispatched_qty column to cartons to track partial dispatches
ALTER TABLE public.cartons 
ADD COLUMN IF NOT EXISTS dispatched_qty integer DEFAULT 0;

-- Create view for dispatch summary by work order (for reporting only)
CREATE OR REPLACE VIEW public.wo_dispatch_summary_vw AS
SELECT 
  wo.id AS wo_id,
  wo.display_id AS wo_number,
  wo.item_code,
  wo.customer,
  wo.quantity AS ordered_qty,
  COALESCE(SUM(d.quantity), 0)::integer AS total_dispatched,
  (wo.quantity - COALESCE(SUM(d.quantity), 0))::integer AS remaining_qty,
  CASE 
    WHEN COALESCE(SUM(d.quantity), 0) >= wo.quantity THEN 'fully_dispatched'
    WHEN COALESCE(SUM(d.quantity), 0) > 0 THEN 'partially_dispatched'
    ELSE 'not_dispatched'
  END AS dispatch_status,
  COUNT(DISTINCT d.id)::integer AS dispatch_count,
  MAX(d.dispatched_at) AS last_dispatch_at
FROM public.work_orders wo
LEFT JOIN public.dispatches d ON d.wo_id = wo.id
GROUP BY wo.id, wo.display_id, wo.item_code, wo.customer, wo.quantity;

-- Create function to update carton dispatched_qty on dispatch
CREATE OR REPLACE FUNCTION public.update_carton_on_dispatch()
RETURNS TRIGGER AS $$
BEGIN
  -- When a dispatch is created with a carton_id, update the carton's dispatched_qty
  IF TG_OP = 'INSERT' AND NEW.carton_id IS NOT NULL THEN
    UPDATE public.cartons
    SET dispatched_qty = COALESCE(dispatched_qty, 0) + NEW.quantity,
        status = CASE 
          WHEN COALESCE(dispatched_qty, 0) + NEW.quantity >= quantity THEN 'dispatched'
          ELSE status
        END
    WHERE id = NEW.carton_id;
  END IF;
  
  -- When a dispatch is deleted, reduce dispatched_qty
  IF TG_OP = 'DELETE' AND OLD.carton_id IS NOT NULL THEN
    UPDATE public.cartons
    SET dispatched_qty = GREATEST(0, COALESCE(dispatched_qty, 0) - OLD.quantity),
        status = CASE 
          WHEN GREATEST(0, COALESCE(dispatched_qty, 0) - OLD.quantity) < quantity 
            AND status = 'dispatched' 
          THEN 'ready_for_dispatch'
          ELSE status
        END
    WHERE id = OLD.carton_id;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for dispatch updates
DROP TRIGGER IF EXISTS trigger_dispatch_carton_update ON public.dispatches;
CREATE TRIGGER trigger_dispatch_carton_update
  AFTER INSERT OR DELETE ON public.dispatches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_carton_on_dispatch();