-- Enable realtime for material_requirements table
ALTER PUBLICATION supabase_realtime ADD TABLE material_requirements;

-- Enable realtime for sales_order_line_items table
ALTER PUBLICATION supabase_realtime ADD TABLE sales_order_line_items;

-- Enable realtime for purchase_orders table (if not already enabled)
ALTER PUBLICATION supabase_realtime ADD TABLE purchase_orders;