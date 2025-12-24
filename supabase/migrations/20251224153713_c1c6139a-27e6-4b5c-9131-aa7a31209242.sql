
-- Update function to extract price from SO items JSONB based on work order item_code
CREATE OR REPLACE FUNCTION public.calculate_ncr_cost_impact()
RETURNS TRIGGER AS $$
DECLARE
  v_price_per_pc numeric;
  v_so_id uuid;
  v_item_code text;
  v_items jsonb;
  v_item jsonb;
BEGIN
  -- Get the sales order ID and item_code from the work order
  SELECT wo.so_id, wo.item_code INTO v_so_id, v_item_code
  FROM work_orders wo
  WHERE wo.id = NEW.work_order_id;
  
  -- Get price per piece from sales order items
  IF v_so_id IS NOT NULL AND v_item_code IS NOT NULL THEN
    SELECT items INTO v_items FROM sales_orders WHERE id = v_so_id;
    
    -- Search through items array for matching item_code
    IF v_items IS NOT NULL THEN
      FOR v_item IN SELECT jsonb_array_elements(v_items)
      LOOP
        IF v_item->>'item_code' = v_item_code THEN
          v_price_per_pc := COALESCE((v_item->>'price_per_pc')::numeric, 0);
          EXIT;
        END IF;
      END LOOP;
    END IF;
    
    -- Calculate cost impact = quantity_affected * price_per_pc
    NEW.cost_impact := COALESCE(NEW.quantity_affected, 0) * COALESCE(v_price_per_pc, 0);
  ELSE
    NEW.cost_impact := 0;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update existing NCRs with correct cost impact from item-level pricing
UPDATE ncrs n
SET cost_impact = COALESCE(n.quantity_affected, 0) * COALESCE(
  (
    SELECT (item->>'price_per_pc')::numeric
    FROM work_orders wo
    JOIN sales_orders so ON wo.so_id = so.id,
    LATERAL jsonb_array_elements(so.items) AS item
    WHERE wo.id = n.work_order_id
    AND item->>'item_code' = wo.item_code
    LIMIT 1
  ),
  0
);
