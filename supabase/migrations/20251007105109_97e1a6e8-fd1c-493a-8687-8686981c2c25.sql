-- Add tracking fields to purchase_orders for received quantities
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS quantity_received_kg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_received_at timestamp with time zone;

-- Add PO reference to material_lots
ALTER TABLE public.material_lots
  ADD COLUMN IF NOT EXISTS po_id uuid REFERENCES public.purchase_orders(id);

-- Create index for PO lookups
CREATE INDEX IF NOT EXISTS idx_material_lots_po_id ON public.material_lots(po_id);

-- Function to update PO status when material is received
CREATE OR REPLACE FUNCTION public.update_po_on_material_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po_record record;
  v_total_received numeric;
BEGIN
  -- Only process if PO is linked
  IF NEW.po_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get PO details
  SELECT * INTO v_po_record
  FROM public.purchase_orders
  WHERE id = NEW.po_id;

  -- Calculate total received for this PO
  SELECT COALESCE(SUM(gross_weight), 0)
  INTO v_total_received
  FROM public.material_lots
  WHERE po_id = NEW.po_id;

  -- Update PO with received quantity and timestamp
  UPDATE public.purchase_orders
  SET 
    quantity_received_kg = v_total_received,
    last_received_at = now(),
    status = CASE
      WHEN v_total_received >= quantity_kg THEN 'completed'
      WHEN v_total_received > 0 THEN 'pending' -- Partially fulfilled
      ELSE status
    END
  WHERE id = NEW.po_id;

  RETURN NEW;
END;
$$;

-- Create trigger for PO updates on material receipt
DROP TRIGGER IF EXISTS update_po_on_material_receipt_trigger ON public.material_lots;
CREATE TRIGGER update_po_on_material_receipt_trigger
  AFTER INSERT OR UPDATE ON public.material_lots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_po_on_material_receipt();