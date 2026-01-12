-- Redesign packable_batches_vw to use QUANTITY-BASED eligibility
-- Packing is unlocked when: qc_approved_qty - packed_qty > 0
-- NO blocking based on production_complete, qc_final_status, batch_status, or stage_type

DROP VIEW IF EXISTS public.packable_batches_vw;

CREATE VIEW public.packable_batches_vw AS
SELECT 
    pb.id,
    pb.wo_id,
    pb.batch_number,
    pb.batch_quantity,
    pb.produced_qty,
    pb.qc_approved_qty,
    pb.qc_rejected_qty,
    pb.dispatched_qty,
    pb.qc_final_status,
    pb.qc_final_approved_at,
    pb.stage_type,
    pb.batch_status,
    pb.created_at,
    pb.production_complete,
    pb.production_complete_qty,
    (COALESCE((
        SELECT sum(c.quantity)::integer 
        FROM cartons c 
        WHERE c.production_batch_id = pb.id
    ), 0))::integer AS packed_qty,
    GREATEST(0, (pb.qc_approved_qty - COALESCE((
        SELECT sum(c.quantity)::integer 
        FROM cartons c 
        WHERE c.production_batch_id = pb.id
    ), 0)))::integer AS available_for_packing,
    wo.display_id AS wo_number,
    wo.item_code,
    wo.customer,
    wo.quantity AS wo_quantity
FROM production_batches pb
JOIN work_orders wo ON wo.id = pb.wo_id
WHERE 
    -- ONLY condition: qc_approved_qty > already packed
    pb.qc_approved_qty > COALESCE((
        SELECT sum(c.quantity)::integer 
        FROM cartons c 
        WHERE c.production_batch_id = pb.id
    ), 0);

COMMENT ON VIEW public.packable_batches_vw IS 'Batches ready for packing. Eligibility: qc_approved_qty > packed_qty. No blocking based on production status, final QC status, or batch completion status.';