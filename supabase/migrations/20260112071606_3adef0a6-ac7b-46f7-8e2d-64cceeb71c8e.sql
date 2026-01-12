-- Fix numeric field overflow for work_orders.completion_pct 
-- Currently numeric(5,2) which can only store up to 999.99%
-- When qty_completed exceeds ordered quantity significantly (e.g. 1500 vs 100 = 1500%)
-- this causes overflow error 22003

-- Step 1: Drop dependent views FIRST
DROP VIEW IF EXISTS public.supplier_work_orders_vw;
DROP VIEW IF EXISTS public.work_orders_restricted;

-- Step 2: Drop and recreate the generated column with proper precision
ALTER TABLE public.work_orders 
DROP COLUMN completion_pct;

ALTER TABLE public.work_orders 
ADD COLUMN completion_pct numeric(7,2) GENERATED ALWAYS AS (
  CASE
    WHEN quantity > 0 THEN round(((qty_completed::numeric * 100.0) / quantity::numeric), 2)
    ELSE 0
  END
) STORED;

-- Step 3: Recreate supplier_work_orders_vw (for supplier portal)
CREATE VIEW public.supplier_work_orders_vw AS
SELECT wo.id,
    wo.wo_number,
    wo.item_code,
    wo.quantity,
    wo.status,
    wo.priority,
    wo.due_date AS target_date,
    wo.created_at,
    wo.customer_id,
    wo.qty_completed,
    wo.qty_dispatched,
    wo.completion_pct,
    cm.customer_name,
    cm.party_code
FROM work_orders wo
JOIN customer_master cm ON cm.id = wo.customer_id
WHERE wo.customer_id IN (
  SELECT sa.customer_id
  FROM supplier_accounts sa
  WHERE sa.user_id = auth.uid() 
    AND sa.is_active = true 
    AND sa.can_view_work_orders = true
);

-- Step 4: Recreate work_orders_restricted (full columns view)
CREATE VIEW public.work_orders_restricted AS
SELECT id,
    customer,
    item_code,
    revision,
    bom,
    quantity,
    due_date,
    sales_order,
    status,
    created_at,
    updated_at,
    so_id,
    production_allowed,
    dispatch_allowed,
    current_stage,
    gross_weight_per_pc,
    net_weight_per_pc,
    material_size_mm,
    customer_po,
    display_id,
    wo_id,
    cycle_time_seconds,
    qc_material_passed,
    qc_first_piece_passed,
    qc_material_approved_by,
    qc_material_approved_at,
    qc_first_piece_approved_by,
    qc_first_piece_approved_at,
    financial_snapshot,
    hidden_financial,
    site_id,
    qc_material_status,
    qc_first_piece_status,
    qc_material_remarks,
    qc_first_piece_remarks,
    priority,
    customer_id,
    cutting_required,
    forging_required,
    forging_vendor,
    wo_number,
    production_start,
    production_end,
    actual_cycle_time_hours,
    external_status,
    qty_external_wip,
    external_process_type,
    ready_for_dispatch,
    material_location,
    qc_status,
    production_locked,
    qc_raw_material_status,
    qc_raw_material_approved_at,
    qc_raw_material_approved_by,
    qc_raw_material_remarks,
    qc_final_status,
    qc_final_approved_at,
    qc_final_approved_by,
    qc_final_remarks,
    production_release_status,
    production_release_date,
    production_released_by,
    production_release_notes,
    quality_released,
    quality_released_at,
    quality_released_by,
    sampling_plan_reference,
    final_qc_result,
    traceability_frozen,
    qty_completed,
    qty_rejected,
    completion_pct,
    qty_dispatched,
    production_complete,
    production_complete_qty,
    production_completed_at,
    production_completed_by,
    production_complete_reason,
    material_requirement_id,
    qty_remaining
FROM work_orders;

-- Add comment explaining the fix
COMMENT ON COLUMN public.work_orders.completion_pct IS 'Completion percentage: (qty_completed / quantity) * 100. Uses numeric(7,2) to allow up to 99999.99% for overproduction scenarios.';