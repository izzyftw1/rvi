-- COMPREHENSIVE GATE REGISTER DATA PROPAGATION FIX
-- Server-side triggers to ensure Gate Register is the SINGLE SOURCE OF TRUTH

-- =============================================
-- PART 1: RAW MATERIAL RECEIPT PROPAGATION
-- =============================================

-- 1a. When raw_po_receipts is created, update raw_purchase_orders status and received totals
CREATE OR REPLACE FUNCTION public.sync_rpo_on_receipt()
RETURNS TRIGGER AS $$
DECLARE
  v_total_received NUMERIC;
  v_ordered_qty NUMERIC;
  v_new_status TEXT;
  v_material_req_id UUID;
BEGIN
  -- Calculate total received for this RPO
  SELECT COALESCE(SUM(qty_received_kg), 0) INTO v_total_received
  FROM public.raw_po_receipts
  WHERE rpo_id = NEW.rpo_id;

  -- Get ordered quantity and material requirement link
  SELECT qty_ordered_kg, material_requirement_id 
  INTO v_ordered_qty, v_material_req_id
  FROM public.raw_purchase_orders
  WHERE id = NEW.rpo_id;

  -- Determine new status
  IF v_total_received >= v_ordered_qty THEN
    v_new_status := 'received';
  ELSIF v_total_received > 0 THEN
    v_new_status := 'part_received';
  ELSE
    v_new_status := 'approved';
  END IF;

  -- Update RPO status
  UPDATE public.raw_purchase_orders
  SET 
    status = v_new_status::rpo_status,
    incoming_qc_status = 'pending',
    updated_at = now()
  WHERE id = NEW.rpo_id;

  -- Update linked material requirement status
  IF v_material_req_id IS NOT NULL THEN
    IF v_total_received >= v_ordered_qty THEN
      UPDATE public.material_requirements
      SET status = 'fulfilled', updated_at = now()
      WHERE id = v_material_req_id;
    ELSIF v_total_received > 0 THEN
      UPDATE public.material_requirements
      SET status = 'partially_fulfilled', updated_at = now()
      WHERE id = v_material_req_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create or replace trigger
DROP TRIGGER IF EXISTS sync_rpo_on_receipt_trigger ON public.raw_po_receipts;
CREATE TRIGGER sync_rpo_on_receipt_trigger
  AFTER INSERT ON public.raw_po_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_rpo_on_receipt();

-- 1b. Keep material_lots in sync with inventory_lots (dual-table sync)
CREATE OR REPLACE FUNCTION public.sync_inventory_to_material_lots()
RETURNS TRIGGER AS $$
BEGIN
  -- When inventory_lots is created, ensure material_lots is also updated
  INSERT INTO public.material_lots (
    lot_id,
    heat_no,
    alloy,
    material_size_mm,
    gross_weight,
    net_weight,
    supplier,
    status,
    qc_status,
    po_id
  ) VALUES (
    NEW.lot_id,
    NEW.heat_no,
    COALESCE(NEW.alloy, 'Unknown'),
    NEW.material_size_mm,
    NEW.qty_kg,
    NEW.qty_kg,
    (SELECT name FROM public.suppliers WHERE id = NEW.supplier_id),
    'received',
    'pending',
    NEW.rpo_id
  ) ON CONFLICT (lot_id) DO UPDATE SET
    gross_weight = EXCLUDED.gross_weight,
    net_weight = EXCLUDED.net_weight,
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS sync_inventory_to_material_lots_trigger ON public.inventory_lots;
CREATE TRIGGER sync_inventory_to_material_lots_trigger
  AFTER INSERT OR UPDATE ON public.inventory_lots
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_inventory_to_material_lots();

-- =============================================
-- PART 2: EXTERNAL PROCESS PROPAGATION
-- =============================================

-- 2a. When wo_external_moves status changes, update work_orders and production_batches
CREATE OR REPLACE FUNCTION public.sync_wo_on_external_move()
RETURNS TRIGGER AS $$
DECLARE
  v_total_sent NUMERIC;
  v_total_returned NUMERIC;
  v_partner_name TEXT;
BEGIN
  -- Calculate totals for this WO/process
  SELECT 
    COALESCE(SUM(quantity_sent), 0),
    COALESCE(SUM(quantity_returned), 0)
  INTO v_total_sent, v_total_returned
  FROM public.wo_external_moves
  WHERE work_order_id = NEW.work_order_id
    AND process = NEW.process;

  -- Get partner name
  SELECT name INTO v_partner_name
  FROM public.external_partners
  WHERE id = NEW.partner_id;

  -- Update work_order external WIP and status
  IF NEW.status = 'sent' THEN
    UPDATE public.work_orders
    SET 
      qty_external_wip = v_total_sent - v_total_returned,
      external_status = 'sent',
      external_process_type = NEW.process,
      material_location = COALESCE(v_partner_name, 'External Partner'),
      updated_at = now()
    WHERE id = NEW.work_order_id;
  ELSIF NEW.status = 'completed' THEN
    UPDATE public.work_orders
    SET 
      qty_external_wip = GREATEST(0, v_total_sent - v_total_returned),
      external_status = CASE WHEN v_total_sent <= v_total_returned THEN NULL ELSE 'partial' END,
      material_location = CASE WHEN v_total_sent <= v_total_returned THEN 'Factory' ELSE material_location END,
      updated_at = now()
    WHERE id = NEW.work_order_id;
  ELSIF NEW.status = 'partial' THEN
    UPDATE public.work_orders
    SET 
      qty_external_wip = v_total_sent - v_total_returned,
      external_status = 'partial',
      updated_at = now()
    WHERE id = NEW.work_order_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS sync_wo_on_external_move_trigger ON public.wo_external_moves;
CREATE TRIGGER sync_wo_on_external_move_trigger
  AFTER INSERT OR UPDATE ON public.wo_external_moves
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_wo_on_external_move();

-- =============================================
-- PART 3: GATE REGISTER MASTER SYNC
-- =============================================

-- 3a. Comprehensive gate register propagation on insert
CREATE OR REPLACE FUNCTION public.gate_register_propagate()
RETURNS TRIGGER AS $$
DECLARE
  v_rpo_record RECORD;
  v_lot_id TEXT;
BEGIN
  -- Only process completed entries
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  -- RAW MATERIAL IN: Update RPO incoming_qc_status
  IF NEW.direction = 'IN' AND NEW.material_type = 'raw_material' AND NEW.rpo_id IS NOT NULL THEN
    -- Set QC status to pending for incoming QC queue
    UPDATE public.raw_purchase_orders
    SET 
      incoming_qc_status = 'pending',
      updated_at = now()
    WHERE id = NEW.rpo_id;
  END IF;

  -- EXTERNAL PROCESS: Track via gate_register → execution_records link
  IF NEW.material_type = 'external_process' AND NEW.work_order_id IS NOT NULL THEN
    -- Create execution record for traceability (if not already created by frontend)
    INSERT INTO public.execution_records (
      work_order_id,
      operation_type,
      direction,
      quantity,
      unit,
      process_name,
      related_partner_id,
      created_by
    ) VALUES (
      NEW.work_order_id,
      'EXTERNAL_PROCESS',
      NEW.direction::execution_direction,
      COALESCE(NEW.estimated_pcs, 0),
      'pcs',
      NEW.process_type,
      NEW.partner_id,
      NEW.created_by
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS gate_register_propagate_trigger ON public.gate_register;
CREATE TRIGGER gate_register_propagate_trigger
  AFTER INSERT OR UPDATE ON public.gate_register
  FOR EACH ROW
  EXECUTE FUNCTION public.gate_register_propagate();

-- =============================================
-- PART 4: QC STATUS PROPAGATION
-- =============================================

-- 4a. When material_lots qc_status changes, update related inventory_lots
CREATE OR REPLACE FUNCTION public.sync_material_qc_to_inventory()
RETURNS TRIGGER AS $$
BEGIN
  -- Keep inventory_lots in sync (if matching lot_id exists)
  -- Note: inventory_lots doesn't have qc_status, so we update via raw_purchase_orders
  IF NEW.po_id IS NOT NULL THEN
    UPDATE public.raw_purchase_orders
    SET 
      incoming_qc_status = NEW.qc_status,
      updated_at = now()
    WHERE id = NEW.po_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS sync_material_qc_to_inventory_trigger ON public.material_lots;
CREATE TRIGGER sync_material_qc_to_inventory_trigger
  AFTER UPDATE OF qc_status ON public.material_lots
  FOR EACH ROW
  WHEN (OLD.qc_status IS DISTINCT FROM NEW.qc_status)
  EXECUTE FUNCTION public.sync_material_qc_to_inventory();

-- =============================================
-- PART 5: ENABLE REALTIME FOR ALL RELATED TABLES
-- =============================================
DO $$
BEGIN
  -- Only add if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'gate_register'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gate_register;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'raw_po_receipts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.raw_po_receipts;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'inventory_lots'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_lots;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'material_lots'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.material_lots;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'wo_external_moves'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wo_external_moves;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'execution_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.execution_records;
  END IF;
END
$$;