-- ============================================================
-- P0 & P1 FIX MIGRATION - ATOMIC AND IDEMPOTENT
-- ============================================================

-- FIRST: Fix the generate_qc_id function to handle legacy alphanumeric IDs
CREATE OR REPLACE FUNCTION public.generate_qc_id(qc_type_in qc_type)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text;
  seq_num integer;
  max_numeric_id integer;
BEGIN
  -- Determine prefix based on QC type
  prefix := CASE qc_type_in
    WHEN 'incoming' THEN 'QC-INC'
    WHEN 'first_piece' THEN 'QC-FP'
    WHEN 'final' THEN 'QC-FIN'
    WHEN 'post_external' THEN 'QC-EXT'
    ELSE 'QC-OTH'
  END;
  
  -- Atomically get next sequence number using advisory lock for safety
  PERFORM pg_advisory_xact_lock(hashtext('qc_id_generator'));
  
  -- Only consider IDs that are purely numeric after the prefix
  -- This ignores legacy alphanumeric IDs like QC-FP-MJL9PKN8
  SELECT COALESCE(MAX(
    CASE 
      WHEN regexp_replace(qc_id, '^' || prefix || '-', '') ~ '^\d+$' 
      THEN regexp_replace(qc_id, '^' || prefix || '-', '')::integer
      ELSE 0
    END
  ), 0) + 1
  INTO seq_num
  FROM public.qc_records
  WHERE qc_id LIKE prefix || '-%';
  
  -- Also check for old QC-IN- prefix for backward compatibility
  IF qc_type_in = 'incoming' OR qc_type_in = 'first_piece' THEN
    SELECT COALESCE(MAX(
      CASE 
        WHEN regexp_replace(qc_id, '^QC-IN-', '') ~ '^\d+$' 
        THEN regexp_replace(qc_id, '^QC-IN-', '')::integer
        ELSE 0
      END
    ), 0) + 1
    INTO max_numeric_id
    FROM public.qc_records
    WHERE qc_id LIKE 'QC-IN-%';
    
    IF max_numeric_id > seq_num THEN
      seq_num := max_numeric_id;
    END IF;
  END IF;
  
  RETURN prefix || '-' || LPAD(seq_num::text, 6, '0');
END;
$$;

-- P0: Create Work Orders for orphaned approved line items
-- Uses the same logic as auto_generate_work_order_from_line_item trigger
DO $$
DECLARE
  li_record RECORD;
  new_wo_uuid uuid;
BEGIN
  -- Process each orphaned line item
  FOR li_record IN 
    SELECT li.*, 
           so.so_id as so_number, so.customer, so.customer_id, so.po_number,
           so.expected_delivery_date, so.gross_weight_per_pc_grams as so_gross,
           so.net_weight_per_pc_grams as so_net, so.material_rod_forging_size_mm,
           so.cycle_time_seconds as so_cycle, so.currency, so.payment_terms_days,
           so.incoterm, so.total_amount
    FROM sales_order_line_items li
    JOIN sales_orders so ON li.sales_order_id = so.id
    WHERE li.status = 'approved' AND li.work_order_id IS NULL
  LOOP
    -- Insert WO (wo_number will be set by trigger)
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
      li_record.customer,
      li_record.customer_id,
      li_record.po_number,
      li_record.item_code,
      li_record.quantity,
      COALESCE(li_record.due_date, li_record.expected_delivery_date, CURRENT_DATE + INTERVAL '30 days'),
      li_record.so_number,
      li_record.sales_order_id,
      'pending',
      'goods_in',
      COALESCE(li_record.gross_weight_per_pc_grams, li_record.so_gross),
      COALESCE(li_record.net_weight_per_pc_grams, li_record.so_net),
      COALESCE(li_record.material_size_mm, li_record.material_rod_forging_size_mm),
      COALESCE(li_record.cycle_time_seconds, li_record.so_cycle),
      jsonb_build_object(
        'currency', COALESCE(li_record.currency, 'USD'),
        'payment_terms_days', li_record.payment_terms_days,
        'incoterm', li_record.incoterm,
        'so_total', COALESCE(li_record.total_amount, 0),
        'line_item', jsonb_build_object(
          'item_code', li_record.item_code,
          'quantity', li_record.quantity,
          'due_date', li_record.due_date,
          'alloy', li_record.alloy,
          'material_size_mm', COALESCE(li_record.material_size_mm, li_record.material_rod_forging_size_mm)
        )
      )
    ) RETURNING id INTO new_wo_uuid;

    -- Link WO back to line item
    UPDATE sales_order_line_items
    SET work_order_id = new_wo_uuid
    WHERE id = li_record.id;

    RAISE NOTICE 'P0: Created WO % for line item %', new_wo_uuid, li_record.id;
  END LOOP;
END $$;

-- P1-1: Backfill work_orders.customer_id from customer_master using exact name match
UPDATE work_orders wo
SET customer_id = cm.id
FROM customer_master cm
WHERE wo.customer_id IS NULL
  AND LOWER(TRIM(wo.customer)) = LOWER(TRIM(cm.customer_name));

-- Also update the linked sales_orders that may be missing customer_id
UPDATE sales_orders so
SET customer_id = cm.id
FROM customer_master cm
WHERE so.customer_id IS NULL
  AND LOWER(TRIM(so.customer)) = LOWER(TRIM(cm.customer_name));

-- P1-2: Remove duplicate carton logging triggers (keep log_carton_build_trigger)
DROP TRIGGER IF EXISTS tr_log_carton_build ON cartons;
DROP TRIGGER IF EXISTS trigger_log_carton_build ON cartons;

-- P1-3: Remove duplicate invoice calculation trigger (keep tr_calculate_invoice_totals)
DROP TRIGGER IF EXISTS invoice_items_update_totals ON invoice_items;

-- P1-4: Remove duplicate payment trigger (keep tr_update_invoice_on_payment)
DROP TRIGGER IF EXISTS payment_update_invoice ON payments;