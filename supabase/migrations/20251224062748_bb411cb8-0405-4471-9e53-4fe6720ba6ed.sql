-- Add production_batch_id to cartons for direct batch tracking
ALTER TABLE public.cartons 
ADD COLUMN IF NOT EXISTS production_batch_id uuid REFERENCES public.production_batches(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_cartons_production_batch_id ON public.cartons(production_batch_id);

-- Create a view to get packable batches (Final QC approved with remaining quantity)
CREATE OR REPLACE VIEW public.packable_batches_vw AS
SELECT 
  pb.id,
  pb.wo_id,
  pb.batch_number,
  pb.batch_quantity,
  pb.produced_qty,
  pb.qc_approved_qty,
  pb.qc_rejected_qty,
  pb.dispatched_qty,
  pb.qc_final_status,
  pb.qc_final_approved_at,
  pb.stage_type,
  pb.batch_status,
  pb.created_at,
  -- Calculate packed quantity from cartons
  COALESCE(
    (SELECT SUM(c.quantity) FROM public.cartons c WHERE c.production_batch_id = pb.id),
    0
  )::integer AS packed_qty,
  -- Available for packing = QC approved - already packed
  (pb.qc_approved_qty - COALESCE(
    (SELECT SUM(c.quantity) FROM public.cartons c WHERE c.production_batch_id = pb.id),
    0
  ))::integer AS available_for_packing,
  -- Work order details
  wo.display_id AS wo_number,
  wo.item_code,
  wo.customer,
  wo.quantity AS wo_quantity
FROM public.production_batches pb
JOIN public.work_orders wo ON wo.id = pb.wo_id
WHERE pb.qc_final_status = 'passed'
  AND pb.batch_status != 'completed'
  AND pb.stage_type NOT IN ('dispatched');

-- Create function to update batch quantities when packing
CREATE OR REPLACE FUNCTION public.update_batch_on_packing()
RETURNS TRIGGER AS $$
BEGIN
  -- When a carton is created with a production_batch_id, update dispatched_qty
  IF TG_OP = 'INSERT' AND NEW.production_batch_id IS NOT NULL THEN
    UPDATE public.production_batches
    SET dispatched_qty = COALESCE(dispatched_qty, 0) + NEW.quantity
    WHERE id = NEW.production_batch_id;
  END IF;
  
  -- When a carton is deleted, reduce dispatched_qty
  IF TG_OP = 'DELETE' AND OLD.production_batch_id IS NOT NULL THEN
    UPDATE public.production_batches
    SET dispatched_qty = GREATEST(0, COALESCE(dispatched_qty, 0) - OLD.quantity)
    WHERE id = OLD.production_batch_id;
  END IF;
  
  -- When quantity is updated
  IF TG_OP = 'UPDATE' AND NEW.production_batch_id IS NOT NULL THEN
    IF OLD.quantity != NEW.quantity THEN
      UPDATE public.production_batches
      SET dispatched_qty = GREATEST(0, COALESCE(dispatched_qty, 0) - OLD.quantity + NEW.quantity)
      WHERE id = NEW.production_batch_id;
    END IF;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for packing updates
DROP TRIGGER IF EXISTS trigger_carton_batch_update ON public.cartons;
CREATE TRIGGER trigger_carton_batch_update
  AFTER INSERT OR UPDATE OR DELETE ON public.cartons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_batch_on_packing();