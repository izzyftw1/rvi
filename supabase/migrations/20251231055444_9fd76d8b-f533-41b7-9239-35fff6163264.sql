-- Fix check_material_fulfillment to use correct column name (nominal_size_mm)
-- and make it more resilient to schema differences
CREATE OR REPLACE FUNCTION public.check_material_fulfillment()
RETURNS TRIGGER AS $$
DECLARE
  v_material_size numeric;
  v_total_inventory numeric;
  v_total_requirement numeric;
BEGIN
  -- Extract numeric value from material_size_mm (e.g., "16mm" -> 16)
  v_material_size := NULLIF(REGEXP_REPLACE(NEW.material_size_mm, '[^0-9.]', '', 'g'), '')::numeric;
  
  IF v_material_size IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Calculate total inventory for this material size
  SELECT COALESCE(SUM(gross_weight), 0)
  INTO v_total_inventory
  FROM public.material_lots
  WHERE NULLIF(REGEXP_REPLACE(material_size_mm, '[^0-9.]', '', 'g'), '')::numeric = v_material_size
    AND status IN ('received', 'in_use');
  
  -- Calculate total requirement for this material size from sales_orders
  SELECT COALESCE(SUM((items->>'quantity')::integer * 
         (COALESCE(gross_weight_per_pc_grams, 0) / 1000.0)), 0)
  INTO v_total_requirement
  FROM public.sales_orders
  WHERE status = 'approved'
    AND NULLIF(REGEXP_REPLACE(material_rod_forging_size_mm, '[^0-9.]', '', 'g'), '')::numeric = v_material_size;
  
  -- Update material requirement status based on inventory vs requirement
  -- Use nominal_size_mm which is the actual column in material_requirements table
  IF v_total_inventory >= v_total_requirement THEN
    -- Fully covered
    UPDATE public.material_requirements
    SET status = 'fulfilled',
        updated_at = now()
    WHERE nominal_size_mm = v_material_size;
  ELSIF v_total_inventory > 0 AND v_total_inventory < v_total_requirement THEN
    -- Partially covered
    UPDATE public.material_requirements
    SET status = 'partially_fulfilled',
        updated_at = now()
    WHERE nominal_size_mm = v_material_size;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;