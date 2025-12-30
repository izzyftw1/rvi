-- Fix Sales Order creation schema mismatch (line item drawing number)
ALTER TABLE public.sales_order_line_items
ADD COLUMN IF NOT EXISTS drawing_number text;
