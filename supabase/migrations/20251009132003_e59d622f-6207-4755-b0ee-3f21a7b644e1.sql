-- Restore automation triggers across the system

-- 1) Sales Order → Work Order
DROP TRIGGER IF EXISTS tr_auto_generate_work_orders ON public.sales_orders;
CREATE TRIGGER tr_auto_generate_work_orders
AFTER INSERT OR UPDATE ON public.sales_orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_generate_work_orders();

DROP TRIGGER IF EXISTS tr_cancel_wos_on_so_cancel ON public.sales_orders;
CREATE TRIGGER tr_cancel_wos_on_so_cancel
AFTER UPDATE ON public.sales_orders
FOR EACH ROW
EXECUTE FUNCTION public.cancel_wos_on_so_cancel();

-- 2) Work Order → SO sync + Stage history
DROP TRIGGER IF EXISTS tr_sync_wo_status_to_so ON public.work_orders;
CREATE TRIGGER tr_sync_wo_status_to_so
AFTER UPDATE ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_wo_status_to_so();

DROP TRIGGER IF EXISTS tr_log_wo_stage_change ON public.work_orders;
CREATE TRIGGER tr_log_wo_stage_change
AFTER UPDATE OF current_stage ON public.work_orders
FOR EACH ROW
WHEN (OLD.current_stage IS DISTINCT FROM NEW.current_stage)
EXECUTE FUNCTION public.log_wo_stage_change();

-- 3) SO Line Items → Update Masters (items/customers)
DROP TRIGGER IF EXISTS tr_update_masters_from_line_item ON public.sales_order_line_items;
CREATE TRIGGER tr_update_masters_from_line_item
AFTER INSERT OR UPDATE ON public.sales_order_line_items
FOR EACH ROW
EXECUTE FUNCTION public.update_masters_from_line_item();

-- 4) Material Lots → PO status, QC notify, Material requirement recompute
DROP TRIGGER IF EXISTS tr_update_po_on_material_receipt ON public.material_lots;
CREATE TRIGGER tr_update_po_on_material_receipt
AFTER INSERT OR UPDATE ON public.material_lots
FOR EACH ROW
EXECUTE FUNCTION public.update_po_on_material_receipt();

DROP TRIGGER IF EXISTS tr_notify_qc_on_material_receipt ON public.material_lots;
CREATE TRIGGER tr_notify_qc_on_material_receipt
AFTER INSERT ON public.material_lots
FOR EACH ROW
EXECUTE FUNCTION public.notify_qc_on_material_receipt();

DROP TRIGGER IF EXISTS tr_check_material_fulfillment ON public.material_lots;
CREATE TRIGGER tr_check_material_fulfillment
AFTER INSERT OR UPDATE ON public.material_lots
FOR EACH ROW
EXECUTE FUNCTION public.check_material_fulfillment();

-- 5) QC → WO action log (Hourly QC)
DROP TRIGGER IF EXISTS tr_log_hourly_qc ON public.hourly_qc_checks;
CREATE TRIGGER tr_log_hourly_qc
AFTER INSERT ON public.hourly_qc_checks
FOR EACH ROW
EXECUTE FUNCTION public.log_hourly_qc();

-- 6) Production Logs → WO actions + daily metrics
DROP TRIGGER IF EXISTS tr_log_production_entry ON public.production_logs;
CREATE TRIGGER tr_log_production_entry
AFTER INSERT ON public.production_logs
FOR EACH ROW
EXECUTE FUNCTION public.log_production_entry();

DROP TRIGGER IF EXISTS tr_recompute_daily_metrics ON public.production_logs;
CREATE TRIGGER tr_recompute_daily_metrics
AFTER INSERT OR UPDATE ON public.production_logs
FOR EACH ROW
EXECUTE FUNCTION public.recompute_daily_metrics();

-- 7) Packing → WO actions
DROP TRIGGER IF EXISTS tr_log_carton_build ON public.cartons;
CREATE TRIGGER tr_log_carton_build
AFTER INSERT ON public.cartons
FOR EACH ROW
EXECUTE FUNCTION public.log_carton_build();

-- 8) Design → WO actions
DROP TRIGGER IF EXISTS tr_log_design_upload ON public.design_files;
CREATE TRIGGER tr_log_design_upload
AFTER INSERT ON public.design_files
FOR EACH ROW
EXECUTE FUNCTION public.log_design_upload();

-- 9) Material Issues → WO actions
DROP TRIGGER IF EXISTS tr_log_material_issue ON public.material_issues;
CREATE TRIGGER tr_log_material_issue
AFTER INSERT ON public.material_issues
FOR EACH ROW
EXECUTE FUNCTION public.log_material_issue();

-- 10) Finance (Payments/Invoice Items) → Invoice totals & status
DROP TRIGGER IF EXISTS tr_update_invoice_on_payment ON public.payments;
CREATE TRIGGER tr_update_invoice_on_payment
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.update_invoice_on_payment();

DROP TRIGGER IF EXISTS tr_calculate_invoice_totals ON public.invoice_items;
CREATE TRIGGER tr_calculate_invoice_totals
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.calculate_invoice_totals();