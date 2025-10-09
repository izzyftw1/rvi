-- Add missing priority column to work_orders to satisfy auto_generate_work_orders trigger
ALTER TABLE public.work_orders
ADD COLUMN IF NOT EXISTS priority integer DEFAULT 3;