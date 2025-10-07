-- Remove priority field from sales order line items
ALTER TABLE sales_order_line_items DROP COLUMN IF EXISTS priority;

-- Remove priority field from work orders
ALTER TABLE work_orders DROP COLUMN IF EXISTS priority;