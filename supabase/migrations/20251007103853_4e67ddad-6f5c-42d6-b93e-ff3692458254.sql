-- Add missing fields to purchase_orders table for material requirements integration
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS material_size_mm text,
  ADD COLUMN IF NOT EXISTS linked_sales_orders jsonb DEFAULT '[]'::jsonb,
  ALTER COLUMN supplier DROP NOT NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_purchase_orders_material_size ON public.purchase_orders(material_size_mm);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(status);