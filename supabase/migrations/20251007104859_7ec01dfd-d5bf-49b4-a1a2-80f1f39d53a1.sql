-- Create triggers and functions for two-way sync between Material Requirements, POs, and Goods In

-- Function to update material requirement status when PO status changes
CREATE OR REPLACE FUNCTION public.sync_material_req_on_po_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When PO is approved, update material requirement status
  IF NEW.status = 'approved' AND OLD.status != 'approved' AND NEW.material_size_mm IS NOT NULL THEN
    UPDATE public.material_requirements
    SET status = 'po_approved',
        updated_at = now()
    WHERE material_size_mm = NEW.material_size_mm::numeric;
  END IF;

  -- When PO is completed, update to fulfilled
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.material_size_mm IS NOT NULL THEN
    UPDATE public.material_requirements
    SET status = 'fulfilled',
        updated_at = now()
    WHERE material_size_mm = NEW.material_size_mm::numeric;
  END IF;

  RETURN NEW;
END;
$$;

-- Function to check fulfillment status when material is received
CREATE OR REPLACE FUNCTION public.check_material_fulfillment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_material_size numeric;
  v_total_inventory numeric;
  v_total_requirement numeric;
BEGIN
  v_material_size := NEW.material_size_mm::numeric;
  
  -- Calculate total inventory for this material size
  SELECT COALESCE(SUM(gross_weight), 0)
  INTO v_total_inventory
  FROM public.material_lots
  WHERE material_size_mm = v_material_size::text
    AND status IN ('received', 'in_use');
  
  -- Calculate total requirement for this material size
  SELECT COALESCE(SUM((items->>'quantity')::integer * 
         (gross_weight_per_pc_grams / 1000.0)), 0)
  INTO v_total_requirement
  FROM public.sales_orders
  WHERE status = 'approved'
    AND material_rod_forging_size_mm = v_material_size::text;
  
  -- Update material requirement status based on inventory vs requirement
  IF v_total_inventory >= v_total_requirement THEN
    -- Fully covered
    UPDATE public.material_requirements
    SET status = 'fulfilled',
        updated_at = now()
    WHERE material_size_mm = v_material_size;
  ELSIF v_total_inventory > 0 AND v_total_inventory < v_total_requirement THEN
    -- Partially covered
    UPDATE public.material_requirements
    SET status = 'partially_fulfilled',
        updated_at = now()
    WHERE material_size_mm = v_material_size;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS sync_material_req_on_po_update_trigger ON public.purchase_orders;
CREATE TRIGGER sync_material_req_on_po_update_trigger
  AFTER UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_material_req_on_po_update();

DROP TRIGGER IF EXISTS check_material_fulfillment_trigger ON public.material_lots;
CREATE TRIGGER check_material_fulfillment_trigger
  AFTER INSERT OR UPDATE ON public.material_lots
  FOR EACH ROW
  EXECUTE FUNCTION public.check_material_fulfillment();

-- Add index for better performance on material size lookups
CREATE INDEX IF NOT EXISTS idx_material_lots_material_size_status 
  ON public.material_lots(material_size_mm, status);