-- Add dispatched_qty to production_batches to track qty dispatched from each batch
ALTER TABLE public.production_batches
ADD COLUMN IF NOT EXISTS dispatched_qty integer DEFAULT 0;

-- Create dispatches table to track individual dispatch records
CREATE TABLE IF NOT EXISTS public.dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  dispatched_by uuid REFERENCES auth.users(id),
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  shipment_id uuid REFERENCES public.shipments(id),
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create index for efficient lookups
CREATE INDEX idx_dispatches_wo_id ON public.dispatches(wo_id);
CREATE INDEX idx_dispatches_batch_id ON public.dispatches(batch_id);
CREATE INDEX idx_dispatches_shipment_id ON public.dispatches(shipment_id);

-- Enable RLS
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Everyone can view dispatches"
ON public.dispatches FOR SELECT
USING (true);

CREATE POLICY "Logistics and admin can manage dispatches"
ON public.dispatches FOR ALL
USING (has_role(auth.uid(), 'logistics'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'logistics'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Function to get dispatchable quantity for a batch (qc_approved - already dispatched)
CREATE OR REPLACE FUNCTION public.get_batch_dispatchable_qty(p_batch_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qc_approved integer;
  v_dispatched integer;
BEGIN
  SELECT COALESCE(qc_approved_qty, 0), COALESCE(dispatched_qty, 0)
  INTO v_qc_approved, v_dispatched
  FROM production_batches
  WHERE id = p_batch_id;
  
  RETURN GREATEST(0, v_qc_approved - v_dispatched);
END;
$$;

-- Trigger function to validate dispatch quantity and update batch
CREATE OR REPLACE FUNCTION public.validate_and_update_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available integer;
  v_batch_wo_id uuid;
BEGIN
  -- Get available dispatchable quantity
  v_available := get_batch_dispatchable_qty(NEW.batch_id);
  
  -- Validate quantity
  IF NEW.quantity > v_available THEN
    RAISE EXCEPTION 'Cannot dispatch % pcs. Only % pcs available (QC approved - already dispatched)', 
      NEW.quantity, v_available;
  END IF;
  
  -- Validate batch belongs to the work order
  SELECT wo_id INTO v_batch_wo_id FROM production_batches WHERE id = NEW.batch_id;
  IF v_batch_wo_id != NEW.wo_id THEN
    RAISE EXCEPTION 'Batch does not belong to this work order';
  END IF;
  
  -- Update batch dispatched qty
  UPDATE production_batches
  SET dispatched_qty = COALESCE(dispatched_qty, 0) + NEW.quantity
  WHERE id = NEW.batch_id;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS validate_dispatch_trigger ON public.dispatches;
CREATE TRIGGER validate_dispatch_trigger
BEFORE INSERT ON public.dispatches
FOR EACH ROW
EXECUTE FUNCTION public.validate_and_update_dispatch();

-- Function to reverse dispatch qty if dispatch is deleted
CREATE OR REPLACE FUNCTION public.reverse_dispatch_qty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE production_batches
  SET dispatched_qty = GREATEST(0, COALESCE(dispatched_qty, 0) - OLD.quantity)
  WHERE id = OLD.batch_id;
  
  RETURN OLD;
END;
$$;

-- Create trigger for delete
DROP TRIGGER IF EXISTS reverse_dispatch_trigger ON public.dispatches;
CREATE TRIGGER reverse_dispatch_trigger
BEFORE DELETE ON public.dispatches
FOR EACH ROW
EXECUTE FUNCTION public.reverse_dispatch_qty();