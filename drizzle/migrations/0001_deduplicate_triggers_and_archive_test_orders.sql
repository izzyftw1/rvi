-- Retain equivalent trigger coverage once per function, timing and event.
DROP TRIGGER trg_auto_create_material_requirement ON public.work_orders;
DROP TRIGGER tr_check_material_fulfillment ON public.material_lots;
DROP TRIGGER trigger_notify_qc_on_material_receipt ON public.material_lots;
DROP TRIGGER update_po_on_material_receipt_trigger ON public.material_lots;
DROP TRIGGER tr_log_hourly_qc ON public.hourly_qc_checks;
DROP TRIGGER trigger_log_hourly_qc ON public.hourly_qc_checks;
DROP TRIGGER tr_log_design_upload ON public.design_files;
DROP TRIGGER trigger_log_design_upload ON public.design_files;
DROP TRIGGER tr_log_production_entry ON public.production_logs;
DROP TRIGGER tr_recompute_daily_metrics ON public.production_logs;
-- The retained combined trigger covers INSERT, UPDATE and DELETE.
DROP TRIGGER tr_sync_batch_produced_qty_insert ON public.daily_production_logs;
DROP TRIGGER tr_sync_batch_produced_qty_update ON public.daily_production_logs;
DROP TRIGGER tr_sync_batch_produced_qty_delete ON public.daily_production_logs;
DROP TRIGGER trg_sync_wo_on_external_move ON public.wo_external_moves;

ALTER TYPE public.wo_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TABLE public.sales_orders ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.work_orders ADD COLUMN is_archived boolean NOT NULL DEFAULT false;

-- Initial backfill of the newly introduced archive columns only.
UPDATE public.sales_orders SET is_archived = true
WHERE created_at < TIMESTAMPTZ '2025-12-01 00:00:00+00';
UPDATE public.work_orders w SET is_archived = true
WHERE EXISTS (
 SELECT 1 FROM public.sales_orders s
 WHERE s.is_archived AND (w.so_id = s.id OR w.sales_order = s.so_id)
);

-- Rank identical WOs by recorded production, packing and dispatch activity.
-- Timestamp ties use the display WO number, then the primary key.
WITH candidates AS (
 SELECT w.id,w.item_code,w.revision,w.quantity,w.due_date,w.created_at,w.wo_number,
  (SELECT COALESCE(sum(b.produced_qty),0) FROM public.production_batches b WHERE b.wo_id=w.id)
  + (SELECT COALESCE(sum(l.actual_quantity),0) FROM public.daily_production_logs l WHERE l.wo_id=w.id)
  + (SELECT COALESCE(sum(c.quantity),0) FROM public.cartons c WHERE c.wo_id=w.id)
  + (SELECT COALESCE(sum(d.quantity),0) FROM public.dispatches d WHERE d.wo_id=w.id)
  + (SELECT COALESCE(sum(d.dispatched_qty),0) FROM public.dispatch_notes d WHERE d.work_order_id=w.id) AS activity_qty,
  (SELECT count(*) FROM public.production_batches b WHERE b.wo_id=w.id)
  + (SELECT count(*) FROM public.daily_production_logs l WHERE l.wo_id=w.id)
  + (SELECT count(*) FROM public.cartons c WHERE c.wo_id=w.id)
  + (SELECT count(*) FROM public.dispatches d WHERE d.wo_id=w.id)
  + (SELECT count(*) FROM public.dispatch_notes d WHERE d.work_order_id=w.id) AS activity_rows
 FROM public.work_orders w
 WHERE w.sales_order='SO-20251225-001'
 OR w.so_id IN (SELECT id FROM public.sales_orders WHERE so_id='SO-20251225-001')
), ranked AS (
 SELECT id,row_number() OVER (
  PARTITION BY item_code,revision,quantity,due_date
  ORDER BY activity_qty DESC,activity_rows DESC,created_at ASC,wo_number ASC,id ASC
 ) AS position FROM candidates
)
UPDATE public.work_orders w SET is_archived=true
FROM ranked r WHERE w.id=r.id AND r.position>1
AND NOT EXISTS (SELECT 1 FROM public.production_batches b WHERE b.wo_id=w.id)
AND NOT EXISTS (SELECT 1 FROM public.daily_production_logs l WHERE l.wo_id=w.id)
AND NOT EXISTS (SELECT 1 FROM public.production_logs l WHERE l.wo_id=w.id)
AND NOT EXISTS (SELECT 1 FROM public.cartons c WHERE c.wo_id=w.id)
AND NOT EXISTS (SELECT 1 FROM public.dispatches d WHERE d.wo_id=w.id)
AND NOT EXISTS (SELECT 1 FROM public.dispatch_notes d WHERE d.work_order_id=w.id)
AND NOT EXISTS (SELECT 1 FROM public.shipments s WHERE s.wo_id=w.id);

CREATE POLICY "Hide archived sales orders" ON public.sales_orders
AS RESTRICTIVE FOR SELECT TO PUBLIC USING (NOT is_archived);
CREATE POLICY "Hide archived work orders" ON public.work_orders
AS RESTRICTIVE FOR SELECT TO PUBLIC USING (NOT is_archived);

-- Preserve all existing masking expressions, columns and view grants.
DO $$
DECLARE definition text;
BEGIN
 definition := pg_get_viewdef('public.work_orders_restricted'::regclass,true);
 IF definition !~ 'FROM work_orders;\s*$' THEN
  RAISE EXCEPTION 'Unexpected work_orders_restricted definition; archive filter not applied';
 END IF;
 EXECUTE 'CREATE OR REPLACE VIEW public.work_orders_restricted AS '
  || regexp_replace(definition,';\s*$','') || ' WHERE NOT is_archived';
END $$;