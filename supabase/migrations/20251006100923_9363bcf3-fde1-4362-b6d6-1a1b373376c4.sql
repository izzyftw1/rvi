-- Change material size columns from numeric to text to support different material types
-- (Hex, Round, Rectangle, Hollow, Forged, etc.)

ALTER TABLE public.material_lots 
  ALTER COLUMN material_size_mm TYPE text USING material_size_mm::text;

ALTER TABLE public.sales_orders 
  ALTER COLUMN material_rod_forging_size_mm TYPE text USING material_rod_forging_size_mm::text;

ALTER TABLE public.work_orders 
  ALTER COLUMN material_size_mm TYPE text USING material_size_mm::text;

ALTER TABLE public.item_master 
  ALTER COLUMN material_size_mm TYPE text USING material_size_mm::text;