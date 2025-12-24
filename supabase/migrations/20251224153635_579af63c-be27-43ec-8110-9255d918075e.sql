
-- Create function to calculate NCR cost impact from Sales Order pricing
CREATE OR REPLACE FUNCTION public.calculate_ncr_cost_impact()
RETURNS TRIGGER AS $$
DECLARE
  v_price_per_pc numeric;
  v_so_id uuid;
BEGIN
  -- Get the sales order ID from the work order
  SELECT wo.so_id INTO v_so_id
  FROM work_orders wo
  WHERE wo.id = NEW.work_order_id;
  
  -- Get price per piece from sales order
  IF v_so_id IS NOT NULL THEN
    SELECT COALESCE(price_per_pc, 0) INTO v_price_per_pc
    FROM sales_orders
    WHERE id = v_so_id;
    
    -- Calculate cost impact = quantity_affected * price_per_pc
    NEW.cost_impact := COALESCE(NEW.quantity_affected, 0) * COALESCE(v_price_per_pc, 0);
  ELSE
    NEW.cost_impact := 0;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-calculate cost on insert/update
DROP TRIGGER IF EXISTS trg_ncr_cost_impact ON public.ncrs;
CREATE TRIGGER trg_ncr_cost_impact
  BEFORE INSERT OR UPDATE OF quantity_affected, work_order_id
  ON public.ncrs
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_ncr_cost_impact();

-- Update existing NCRs with correct cost impact
UPDATE ncrs n
SET cost_impact = COALESCE(n.quantity_affected, 0) * COALESCE(
  (SELECT so.price_per_pc 
   FROM work_orders wo 
   JOIN sales_orders so ON wo.so_id = so.id 
   WHERE wo.id = n.work_order_id),
  0
)
WHERE n.cost_impact = 0 OR n.cost_impact IS NULL;
