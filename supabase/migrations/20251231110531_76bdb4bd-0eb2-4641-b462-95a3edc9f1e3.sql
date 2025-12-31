
-- Fix Medium Priority 2: Drop orphan supplier_users table
DROP TABLE IF EXISTS supplier_users;

-- Fix Critical Gap 3: Drop and recreate problematic views without SECURITY DEFINER
-- Only recreating the simpler views that don't have column mismatches

DROP VIEW IF EXISTS customer_credit_ledger_vw;
CREATE VIEW customer_credit_ledger_vw AS
SELECT 
  cca.id, cca.customer_id, cm.customer_name, cca.adjustment_type,
  cca.original_amount, cca.remaining_amount, cca.currency, cca.reason,
  cca.status, cca.created_at, cca.source_invoice_id, i.invoice_no as source_invoice_no
FROM customer_credit_adjustments cca
JOIN customer_master cm ON cca.customer_id = cm.id
LEFT JOIN invoices i ON cca.source_invoice_id = i.id;

DROP VIEW IF EXISTS customer_last_order;
CREATE VIEW customer_last_order AS
SELECT cm.id as customer_id, cm.customer_name, MAX(so.created_at) as last_order_date, COUNT(DISTINCT so.id) as total_orders
FROM customer_master cm LEFT JOIN sales_orders so ON cm.id = so.customer_id GROUP BY cm.id, cm.customer_name;

DROP VIEW IF EXISTS dashboard_summary_vw;
CREATE VIEW dashboard_summary_vw AS
SELECT 
  (SELECT COUNT(*) FROM work_orders WHERE status = 'in_progress') as active_work_orders,
  (SELECT COUNT(*) FROM work_orders WHERE status = 'completed') as completed_work_orders,
  (SELECT COUNT(*) FROM production_batches WHERE batch_status = 'in_progress') as active_batches,
  (SELECT COUNT(*) FROM ncrs WHERE status = 'OPEN') as open_ncrs;

DROP VIEW IF EXISTS finished_goods_summary_vw;
CREATE VIEW finished_goods_summary_vw AS
SELECT item_code, SUM(quantity_available) as total_available, SUM(quantity_reserved) as total_reserved, COUNT(DISTINCT work_order_id) as work_order_count
FROM finished_goods_inventory GROUP BY item_code;

DROP VIEW IF EXISTS wo_external_partners;
CREATE VIEW wo_external_partners AS
SELECT DISTINCT ep.id, ep.name, ep.process_type, ep.contact_person, ep.phone, ep.email
FROM external_partners ep WHERE ep.is_active = true;

DROP VIEW IF EXISTS work_orders_restricted;
CREATE VIEW work_orders_restricted AS SELECT * FROM work_orders;
