-- Fix the auto_create_material_requirement function to handle text material sizes like "16mm"
CREATE OR REPLACE FUNCTION public.auto_create_material_requirement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_size_numeric numeric;
BEGIN
  -- Create material requirement entry when WO is created from SO
  IF NEW.so_id IS NOT NULL AND NEW.material_size_mm IS NOT NULL THEN
    -- Extract numeric value from material_size_mm (e.g., "16mm" -> 16)
    v_size_numeric := NULLIF(REGEXP_REPLACE(NEW.material_size_mm, '[^0-9.]', '', 'g'), '')::numeric;
    
    INSERT INTO public.material_requirements_v2 (
      so_id,
      wo_id,
      material_grade,
      material_size_mm,
      alloy,
      qty_pcs,
      gross_wt_pc,
      net_wt_pc,
      customer,
      customer_id,
      due_date,
      status
    )
    SELECT
      NEW.so_id,
      NEW.id,
      NEW.material_size_mm || ' - ' || COALESCE(
        (NEW.financial_snapshot->'line_item'->>'alloy')::text,
        'Unknown'
      ),
      v_size_numeric,
      COALESCE((NEW.financial_snapshot->'line_item'->>'alloy')::text, 'Unknown'),
      NEW.quantity,
      NEW.gross_weight_per_pc,
      NEW.net_weight_per_pc,
      NEW.customer,
      NEW.customer_id,
      NEW.due_date,
      'pending'
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Fix the check_material_fulfillment function to handle text material sizes
CREATE OR REPLACE FUNCTION public.check_material_fulfillment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  
  -- Calculate total requirement for this material size
  SELECT COALESCE(SUM((items->>'quantity')::integer * 
         (gross_weight_per_pc_grams / 1000.0)), 0)
  INTO v_total_requirement
  FROM public.sales_orders
  WHERE status = 'approved'
    AND NULLIF(REGEXP_REPLACE(material_rod_forging_size_mm, '[^0-9.]', '', 'g'), '')::numeric = v_material_size;
  
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
$function$;