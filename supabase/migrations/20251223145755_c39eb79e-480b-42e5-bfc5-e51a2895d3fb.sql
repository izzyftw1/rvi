-- Add batch_id to cartons table for batch-level packing tracking
ALTER TABLE public.cartons 
ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.production_batches(id);

-- Create index for efficient batch queries
CREATE INDEX IF NOT EXISTS idx_cartons_batch_id ON public.cartons(batch_id);

-- Create a function to validate carton quantity against batch QC-approved balance
CREATE OR REPLACE FUNCTION public.validate_carton_packing_quantity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_batch production_batches%ROWTYPE;
  v_already_packed INTEGER;
  v_available_qty INTEGER;
BEGIN
  -- Skip validation if no batch specified (legacy cartons)
  IF NEW.batch_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get the batch details
  SELECT * INTO v_batch
  FROM production_batches
  WHERE id = NEW.batch_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid batch_id: Production batch not found';
  END IF;
  
  -- Verify batch belongs to the same work order
  IF v_batch.wo_id != NEW.wo_id THEN
    RAISE EXCEPTION 'Batch does not belong to this work order';
  END IF;
  
  -- Calculate already packed quantity for this batch (excluding current record for updates)
  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(SUM(quantity), 0) INTO v_already_packed
    FROM cartons
    WHERE batch_id = NEW.batch_id AND id != NEW.id;
  ELSE
    SELECT COALESCE(SUM(quantity), 0) INTO v_already_packed
    FROM cartons
    WHERE batch_id = NEW.batch_id;
  END IF;
  
  -- Calculate available quantity (QC approved - already packed)
  v_available_qty := v_batch.qc_approved_qty - v_already_packed;
  
  -- Validate the packing quantity
  IF NEW.quantity > v_available_qty THEN
    RAISE EXCEPTION 'Packing quantity (%) exceeds available QC-approved balance (%). Batch has % QC-approved, % already packed.', 
      NEW.quantity, 
      v_available_qty,
      v_batch.qc_approved_qty,
      v_already_packed;
  END IF;
  
  -- Validate quantity is positive
  IF NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Packing quantity must be greater than 0';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to validate packing quantity
DROP TRIGGER IF EXISTS validate_carton_packing_qty ON public.cartons;
CREATE TRIGGER validate_carton_packing_qty
  BEFORE INSERT OR UPDATE ON public.cartons
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_carton_packing_quantity();

-- Create a function to get packable quantity for a batch
CREATE OR REPLACE FUNCTION public.get_batch_packable_qty(p_batch_id UUID)
RETURNS TABLE(
  qc_approved_qty INTEGER,
  already_packed_qty INTEGER,
  available_to_pack INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_approved INTEGER;
  v_packed INTEGER;
BEGIN
  -- Get QC approved quantity
  SELECT COALESCE(pb.qc_approved_qty, 0) INTO v_approved
  FROM production_batches pb
  WHERE pb.id = p_batch_id;
  
  IF v_approved IS NULL THEN
    v_approved := 0;
  END IF;
  
  -- Get already packed quantity
  SELECT COALESCE(SUM(c.quantity), 0) INTO v_packed
  FROM cartons c
  WHERE c.batch_id = p_batch_id;
  
  RETURN QUERY SELECT 
    v_approved,
    v_packed,
    GREATEST(v_approved - v_packed, 0);
END;
$$;