
-- Step 1: Update the trigger function to pull material specs from item_master
CREATE OR REPLACE FUNCTION auto_generate_work_order_from_line_item()
RETURNS TRIGGER AS $$
DECLARE
  new_wo_uuid uuid;
  so_record record;
  item_record record;
  v_material_size text;
  v_alloy text;
  v_gross_weight numeric;
  v_net_weight numeric;
  v_cycle_time numeric;
BEGIN
  -- Only fire when line item status changes to 'approved' and no WO exists yet
  IF (TG_OP = 'UPDATE' AND OLD.status != 'approved' AND NEW.status = 'approved' AND NEW.work_order_id IS NULL) THEN
    
    -- Get SO details
    SELECT * INTO so_record FROM sales_orders WHERE id = NEW.sales_order_id;
    
    IF NOT FOUND THEN
      RAISE NOTICE 'Sales order not found for line item %', NEW.id;
      RETURN NEW;
    END IF;

    -- Get item master details for material specs
    SELECT * INTO item_record FROM item_master WHERE item_code = NEW.item_code LIMIT 1;

    -- Priority: line_item > sales_order > item_master
    v_material_size := COALESCE(
      NEW.material_size_mm,
      so_record.material_rod_forging_size_mm,
      CASE WHEN item_record.default_nominal_size_mm IS NOT NULL THEN
        COALESCE(item_record.default_cross_section_shape, 'round') || ' ' || item_record.default_nominal_size_mm::text || 'mm'
      ELSE NULL END,
      item_record.material_size_mm
    );
    
    v_alloy := COALESCE(
      NEW.alloy,
      item_record.default_material_grade,
      item_record.alloy
    );
    
    v_gross_weight := COALESCE(
      NEW.gross_weight_per_pc_grams,
      so_record.gross_weight_per_pc_grams,
      item_record.estimated_gross_weight_g,
      item_record.gross_weight_grams
    );
    
    v_net_weight := COALESCE(
      NEW.net_weight_per_pc_grams,
      so_record.net_weight_per_pc_grams,
      item_record.estimated_net_weight_g,
      item_record.net_weight_grams
    );
    
    v_cycle_time := COALESCE(
      NEW.cycle_time_seconds,
      so_record.cycle_time_seconds,
      item_record.estimated_cycle_time_s,
      item_record.cycle_time_seconds
    );

    -- Insert WO WITHOUT setting wo_number or display_id (trigger will set them)
    INSERT INTO work_orders (
      customer,
      customer_id,
      customer_po,
      item_code,
      quantity,
      due_date,
      sales_order,
      so_id,
      status,
      current_stage,
      gross_weight_per_pc,
      net_weight_per_pc,
      material_size_mm,
      cycle_time_seconds,
      financial_snapshot
    ) VALUES (
      so_record.customer,
      so_record.customer_id,
      so_record.po_number,
      NEW.item_code,
      NEW.quantity,
      COALESCE(NEW.due_date, so_record.expected_delivery_date, CURRENT_DATE + INTERVAL '30 days'),
      so_record.so_id,
      NEW.sales_order_id,
      'pending',
      'goods_in',
      v_gross_weight,
      v_net_weight,
      v_material_size,
      v_cycle_time,
      jsonb_build_object(
        'currency', COALESCE(so_record.currency, 'USD'),
        'payment_terms_days', so_record.payment_terms_days,
        'incoterm', so_record.incoterm,
        'so_total', COALESCE(so_record.total_amount, 0),
        'line_item', jsonb_build_object(
          'item_code', NEW.item_code,
          'quantity', NEW.quantity,
          'price_per_pc', NULL,
          'line_amount', NULL,
          'due_date', NEW.due_date,
          'drawing_number', NEW.drawing_number,
          'alloy', v_alloy,
          'material_size_mm', v_material_size,
          'material_grade', v_alloy
        )
      )
    ) RETURNING id INTO new_wo_uuid;

    -- Link WO back to line item
    UPDATE sales_order_line_items
    SET work_order_id = new_wo_uuid
    WHERE id = NEW.id;

    RAISE NOTICE 'Generated Work Order % for line item % of SO %', new_wo_uuid, NEW.line_number, so_record.so_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 2: Update existing work orders with missing material specs from item_master
UPDATE work_orders wo
SET 
  material_size_mm = COALESCE(
    wo.material_size_mm,
    CASE WHEN im.default_nominal_size_mm IS NOT NULL THEN
      COALESCE(im.default_cross_section_shape, 'round') || ' ' || im.default_nominal_size_mm::text || 'mm'
    ELSE im.material_size_mm END
  ),
  gross_weight_per_pc = COALESCE(wo.gross_weight_per_pc, im.estimated_gross_weight_g, im.gross_weight_grams),
  net_weight_per_pc = COALESCE(wo.net_weight_per_pc, im.estimated_net_weight_g, im.net_weight_grams),
  cycle_time_seconds = COALESCE(wo.cycle_time_seconds, im.estimated_cycle_time_s, im.cycle_time_seconds),
  financial_snapshot = COALESCE(wo.financial_snapshot, '{}'::jsonb) || jsonb_build_object(
    'line_item', COALESCE(wo.financial_snapshot->'line_item', '{}'::jsonb) || jsonb_build_object(
      'alloy', COALESCE(im.default_material_grade, im.alloy),
      'material_grade', COALESCE(im.default_material_grade, im.alloy)
    )
  )
FROM item_master im
WHERE wo.item_code = im.item_code
  AND (wo.material_size_mm IS NULL OR wo.gross_weight_per_pc IS NULL OR wo.net_weight_per_pc IS NULL);

-- Step 3: Create/update material_requirements_v2 entries for work orders
-- Only for WOs where so_id exists in sales_orders AND doesn't already have an entry
INSERT INTO material_requirements_v2 (
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
  wo.so_id,
  wo.id,
  COALESCE(
    (wo.financial_snapshot->'line_item'->>'material_grade')::text,
    (wo.financial_snapshot->'line_item'->>'alloy')::text,
    im.default_material_grade,
    im.alloy,
    'Unknown'
  ) || CASE WHEN wo.material_size_mm IS NOT NULL THEN ' - ' || NULLIF(REGEXP_REPLACE(wo.material_size_mm, '[^0-9.]', '', 'g'), '') || 'mm' ELSE '' END,
  COALESCE(NULLIF(REGEXP_REPLACE(wo.material_size_mm, '[^0-9.]', '', 'g'), '')::numeric, 0),
  COALESCE(
    (wo.financial_snapshot->'line_item'->>'alloy')::text,
    im.default_material_grade,
    im.alloy,
    'Unknown'
  ),
  wo.quantity,
  COALESCE(wo.gross_weight_per_pc, im.estimated_gross_weight_g, im.gross_weight_grams, 0),
  COALESCE(wo.net_weight_per_pc, im.estimated_net_weight_g, im.net_weight_grams, 0),
  wo.customer,
  wo.customer_id,
  wo.due_date,
  'pending'
FROM work_orders wo
LEFT JOIN item_master im ON wo.item_code = im.item_code
WHERE wo.so_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM material_requirements_v2 mr WHERE mr.wo_id = wo.id
  )
  -- Only insert if so_id actually exists in sales_orders
  AND EXISTS (
    SELECT 1 FROM sales_orders so WHERE so.id = wo.so_id
  )
ON CONFLICT DO NOTHING;

-- Step 4: Update auto_create_material_requirement to work with material_requirements_v2
CREATE OR REPLACE FUNCTION auto_create_material_requirement()
RETURNS TRIGGER AS $$
DECLARE
  v_size_numeric numeric;
  v_alloy text;
BEGIN
  -- Create material requirement entry when WO is created from SO
  IF NEW.so_id IS NOT NULL THEN
    -- Extract numeric value from material_size_mm (e.g., "16mm" -> 16)
    v_size_numeric := NULLIF(REGEXP_REPLACE(COALESCE(NEW.material_size_mm, '0'), '[^0-9.]', '', 'g'), '')::numeric;
    
    -- Get alloy from financial_snapshot
    v_alloy := COALESCE(
      (NEW.financial_snapshot->'line_item'->>'alloy')::text,
      (NEW.financial_snapshot->'line_item'->>'material_grade')::text,
      'Unknown'
    );
    
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
    VALUES (
      NEW.so_id,
      NEW.id,
      v_alloy || CASE WHEN v_size_numeric IS NOT NULL AND v_size_numeric > 0 THEN ' - ' || v_size_numeric || 'mm' ELSE '' END,
      COALESCE(v_size_numeric, 0),
      v_alloy,
      NEW.quantity,
      COALESCE(NEW.gross_weight_per_pc, 0),
      COALESCE(NEW.net_weight_per_pc, 0),
      NEW.customer,
      NEW.customer_id,
      NEW.due_date,
      'pending'
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 5: Create trigger on work_orders to auto-create material requirement
DROP TRIGGER IF EXISTS trg_auto_create_material_requirement ON work_orders;
CREATE TRIGGER trg_auto_create_material_requirement
AFTER INSERT ON work_orders
FOR EACH ROW
EXECUTE FUNCTION auto_create_material_requirement();
