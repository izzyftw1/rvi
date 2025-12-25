
-- =====================================================
-- SALES ORDER → WORK ORDER STABILIZATION MIGRATION
-- =====================================================
-- This migration:
-- 1. Removes all duplicate triggers
-- 2. Creates server-side SO ID generator
-- 3. Consolidates WO generation to single path (via line_items)
-- 4. Fixes wo_number generation conflicts
-- 5. Ensures atomic, idempotent operations
-- =====================================================

-- STEP 1: DROP ALL DUPLICATE TRIGGERS ON sales_orders
DROP TRIGGER IF EXISTS auto_generate_work_orders_trigger ON public.sales_orders;
DROP TRIGGER IF EXISTS tr_auto_generate_work_orders ON public.sales_orders;
DROP TRIGGER IF EXISTS trigger_auto_generate_work_orders ON public.sales_orders;
DROP TRIGGER IF EXISTS cancel_wos_on_so_cancel ON public.sales_orders;
DROP TRIGGER IF EXISTS cancel_wos_on_so_cancel_trigger ON public.sales_orders;
DROP TRIGGER IF EXISTS tr_cancel_wos_on_so_cancel ON public.sales_orders;
DROP TRIGGER IF EXISTS sync_so_to_wo_trigger ON public.sales_orders;
DROP TRIGGER IF EXISTS trigger_sync_so_to_wo ON public.sales_orders;

-- STEP 2: DROP ALL DUPLICATE TRIGGERS ON work_orders
DROP TRIGGER IF EXISTS sync_wo_completion_to_so ON public.work_orders;
DROP TRIGGER IF EXISTS tr_sync_wo_status_to_so ON public.work_orders;
DROP TRIGGER IF EXISTS trigger_sync_wo_status_to_so ON public.work_orders;
DROP TRIGGER IF EXISTS log_wo_stage_change_trigger ON public.work_orders;
DROP TRIGGER IF EXISTS tr_log_wo_stage_change ON public.work_orders;

-- STEP 3: DROP ALL DUPLICATE TRIGGERS ON qc_records  
DROP TRIGGER IF EXISTS log_qc_record_trigger ON public.qc_records;
DROP TRIGGER IF EXISTS trigger_log_qc_record ON public.qc_records;

-- STEP 4: DROP ALL DUPLICATE TRIGGERS ON sales_order_line_items
DROP TRIGGER IF EXISTS tr_update_masters_from_line_item ON public.sales_order_line_items;
DROP TRIGGER IF EXISTS trigger_update_masters_from_line_item ON public.sales_order_line_items;

-- =====================================================
-- STEP 5: CREATE SERVER-SIDE SO ID GENERATOR
-- =====================================================
CREATE OR REPLACE FUNCTION public.generate_so_number()
RETURNS text AS $$
DECLARE
  current_date_str TEXT;
  next_sequence INTEGER;
BEGIN
  current_date_str := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
  
  -- Atomically get next sequence using advisory lock
  PERFORM pg_advisory_xact_lock(hashtext('so_id_generator'));
  
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(so_id FROM 'SO-' || current_date_str || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO next_sequence
  FROM sales_orders
  WHERE so_id LIKE 'SO-' || current_date_str || '-%';
  
  RETURN 'SO-' || current_date_str || '-' || LPAD(next_sequence::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- STEP 6: CREATE TRIGGER TO AUTO-SET SO ID
-- =====================================================
CREATE OR REPLACE FUNCTION public.trigger_set_so_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Always generate so_id server-side to ensure uniqueness
  IF NEW.so_id IS NULL OR NEW.so_id = '' THEN
    NEW.so_id := generate_so_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS set_so_id_trigger ON public.sales_orders;
CREATE TRIGGER set_so_id_trigger
  BEFORE INSERT ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_so_id();

-- =====================================================
-- STEP 7: FIX WO NUMBER GENERATOR TO NOT CONFLICT
-- The trigger_set_wo_number must handle pre-set values properly
-- =====================================================
CREATE OR REPLACE FUNCTION public.trigger_set_wo_number()
RETURNS TRIGGER AS $$
BEGIN
  -- ALWAYS generate wo_number server-side - never trust client input
  -- This ensures atomic, server-side generation
  NEW.wo_number := generate_wo_number();
  
  -- Also set display_id to match for consistency
  NEW.display_id := NEW.wo_number;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- STEP 8: FIX auto_generate_work_order_from_line_item
-- This is the ONLY authoritative WO generator (from line items)
-- Remove wo_number setting - let trigger handle it
-- =====================================================
CREATE OR REPLACE FUNCTION public.auto_generate_work_order_from_line_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_wo_uuid uuid;
  so_record record;
BEGIN
  -- Only fire when line item status changes to 'approved' and no WO exists yet
  IF (TG_OP = 'UPDATE' AND OLD.status != 'approved' AND NEW.status = 'approved' AND NEW.work_order_id IS NULL) THEN
    
    -- Get SO details
    SELECT * INTO so_record FROM sales_orders WHERE id = NEW.sales_order_id;
    
    IF NOT FOUND THEN
      RAISE NOTICE 'Sales order not found for line item %', NEW.id;
      RETURN NEW;
    END IF;

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
      COALESCE(NEW.gross_weight_per_pc_grams, so_record.gross_weight_per_pc_grams),
      COALESCE(NEW.net_weight_per_pc_grams, so_record.net_weight_per_pc_grams),
      COALESCE(NEW.material_size_mm, so_record.material_rod_forging_size_mm),
      COALESCE(NEW.cycle_time_seconds, so_record.cycle_time_seconds),
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
          'drawing_number', NULL,
          'alloy', NEW.alloy,
          'material_size_mm', COALESCE(NEW.material_size_mm, so_record.material_rod_forging_size_mm)
        )
      )
    ) RETURNING id INTO new_wo_uuid;

    -- Link WO back to line item
    UPDATE sales_order_line_items
    SET work_order_id = new_wo_uuid
    WHERE id = NEW.id;

    RAISE NOTICE 'Generated Work Order for line item % of SO %', NEW.line_number, so_record.so_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- =====================================================
-- STEP 9: DISABLE auto_generate_work_orders (from items JSONB)
-- This function conflicts with line_item based generation
-- =====================================================
CREATE OR REPLACE FUNCTION public.auto_generate_work_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- DISABLED: WO generation now happens via sales_order_line_items trigger
  -- This prevents duplicate WO creation
  RETURN NEW;
END;
$$;

-- =====================================================
-- STEP 10: RE-CREATE SINGLE AUTHORITATIVE TRIGGERS
-- =====================================================

-- Single cancel trigger for SO cancellation
CREATE TRIGGER cancel_wos_on_so_cancel_trigger
  AFTER UPDATE ON public.sales_orders
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
  EXECUTE FUNCTION cancel_wos_on_so_cancel();

-- Single sync trigger for SO → WO sync
CREATE TRIGGER sync_so_to_wo_trigger
  AFTER UPDATE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION sync_so_to_wo();

-- Single WO status sync trigger
CREATE TRIGGER sync_wo_status_to_so_trigger
  AFTER UPDATE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION sync_wo_status_to_so();

-- Single WO stage change log trigger
CREATE TRIGGER log_wo_stage_change_trigger
  AFTER UPDATE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION log_wo_stage_change();

-- Single QC record log trigger
CREATE TRIGGER log_qc_record_trigger
  AFTER INSERT ON public.qc_records
  FOR EACH ROW
  EXECUTE FUNCTION log_qc_record();

-- Single masters update trigger on line items
CREATE TRIGGER update_masters_from_line_item_trigger
  AFTER INSERT ON public.sales_order_line_items
  FOR EACH ROW
  EXECUTE FUNCTION update_masters_from_line_item();

-- =====================================================
-- STEP 11: ENSURE SALES BOOKING TRIGGER EXISTS (single)
-- =====================================================
DROP TRIGGER IF EXISTS trigger_auto_create_sales_booking ON public.sales_orders;
CREATE TRIGGER trigger_auto_create_sales_booking
  AFTER INSERT OR UPDATE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_sales_booking();

-- =====================================================
-- STEP 12: ADD SO ID IMMUTABILITY TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION public.prevent_so_id_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.so_id IS NOT NULL AND NEW.so_id IS DISTINCT FROM OLD.so_id THEN
    RAISE EXCEPTION 'so_id is immutable and cannot be changed after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS prevent_so_id_change_trigger ON public.sales_orders;
CREATE TRIGGER prevent_so_id_change_trigger
  BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION prevent_so_id_change();
