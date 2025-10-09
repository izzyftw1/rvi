-- Update auto_generate_work_order_from_line_item to include financial snapshot
CREATE OR REPLACE FUNCTION public.auto_generate_work_order_from_line_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  new_wo_id text;
  new_wo_uuid uuid;
  so_record record;
BEGIN
  -- Only generate WO when status changes to 'approved'
  IF (TG_OP = 'UPDATE' AND OLD.status != 'approved' AND NEW.status = 'approved' AND NEW.work_order_id IS NULL) THEN
    
    -- Get sales order details
    SELECT * INTO so_record FROM sales_orders WHERE id = NEW.sales_order_id;
    
    -- Generate WO ID: ISO-[CustomerPO]-[LineNumber] (e.g., ISO-72823-001)
    new_wo_id := 'ISO-' || so_record.po_number || '-' || LPAD(NEW.line_number::text, 3, '0');
    
    -- Insert new work order with financial snapshot
    INSERT INTO work_orders (
      wo_id,
      display_id,
      customer,
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
      gen_random_uuid(),
      new_wo_id,
      so_record.customer,
      so_record.po_number,
      NEW.item_code,
      NEW.quantity,
      NEW.due_date,
      so_record.so_id,
      NEW.sales_order_id,
      'pending',
      'goods_in',
      NEW.gross_weight_per_pc_grams,
      NEW.net_weight_per_pc_grams,
      NEW.material_size_mm,
      NEW.cycle_time_seconds,
      jsonb_build_object(
        'currency', so_record.currency,
        'payment_terms_days', so_record.payment_terms_days,
        'incoterm', so_record.incoterm,
        'so_total', so_record.total_value,
        'line_item', jsonb_build_object(
          'item_code', NEW.item_code,
          'quantity', NEW.quantity,
          'price_per_pc', NEW.price_per_pc,
          'line_amount', NEW.line_amount,
          'due_date', NEW.due_date,
          'drawing_number', NEW.drawing_number,
          'alloy', NEW.alloy,
          'material_size_mm', NEW.material_size_mm
        )
      )
    ) RETURNING id INTO new_wo_uuid;
    
    -- Update the line item with the work order UUID
    UPDATE sales_order_line_items
    SET work_order_id = new_wo_uuid
    WHERE id = NEW.id;
    
    -- Log the WO generation
    RAISE NOTICE 'Generated Work Order % for line item % of SO %', new_wo_id, NEW.line_number, so_record.so_id;
    
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Update auto_generate_work_orders to include financial snapshot
CREATE OR REPLACE FUNCTION public.auto_generate_work_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  item_record jsonb;
  new_display_id text;
  item_counter integer := 1;
BEGIN
  -- Only generate WOs when status changes to 'approved'
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') OR 
     (TG_OP = 'UPDATE' AND OLD.status != 'approved' AND NEW.status = 'approved') THEN
    
    -- Loop through each item in the sales order
    FOR item_record IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      -- Generate display_id: ISO-[CustomerPO]-[SO_ID]-[ItemNumber]
      new_display_id := 'ISO-' || NEW.po_number || '-' || NEW.so_id || '-' || LPAD(item_counter::text, 3, '0');
      
      -- Insert new work order with financial snapshot
      INSERT INTO public.work_orders (
        wo_id,
        display_id,
        customer,
        customer_po,
        item_code,
        revision,
        quantity,
        due_date,
        priority,
        sales_order,
        status,
        current_stage,
        gross_weight_per_pc,
        net_weight_per_pc,
        material_size_mm,
        cycle_time_seconds,
        financial_snapshot
      ) VALUES (
        gen_random_uuid(),
        new_display_id,
        NEW.customer,
        NEW.po_number,
        COALESCE(item_record->>'item_code', 'N/A'),
        COALESCE(item_record->>'revision', '0'),
        COALESCE((item_record->>'quantity')::integer, 0),
        COALESCE((item_record->>'due_date')::date, CURRENT_DATE + interval '30 days'),
        COALESCE((item_record->>'priority')::integer, 3),
        NEW.id,
        'pending',
        'goods_in',
        NEW.gross_weight_per_pc_grams,
        NEW.net_weight_per_pc_grams,
        NEW.material_rod_forging_size_mm,
        NEW.cycle_time_seconds,
        jsonb_build_object(
          'currency', NEW.currency,
          'payment_terms_days', NEW.payment_terms_days,
          'incoterm', NEW.incoterm,
          'so_total', NEW.total_value,
          'line_item', jsonb_build_object(
            'item_code', COALESCE(item_record->>'item_code', 'N/A'),
            'quantity', COALESCE((item_record->>'quantity')::integer, 0),
            'price_per_pc', COALESCE((item_record->>'price_per_pc')::numeric, 0),
            'line_amount', COALESCE((item_record->>'line_amount')::numeric, 0),
            'due_date', COALESCE(item_record->>'due_date', ''),
            'drawing_number', COALESCE(item_record->>'drawing_number', ''),
            'alloy', NEW.alloy,
            'material_size_mm', NEW.material_rod_forging_size_mm
          )
        )
      );
      
      item_counter := item_counter + 1;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;