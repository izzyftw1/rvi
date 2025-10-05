-- Add new fields to sales_orders table
ALTER TABLE public.sales_orders 
ADD COLUMN IF NOT EXISTS material_rod_forging_size_mm numeric,
ADD COLUMN IF NOT EXISTS gross_weight_per_pc_grams numeric,
ADD COLUMN IF NOT EXISTS net_weight_per_pc_grams numeric;