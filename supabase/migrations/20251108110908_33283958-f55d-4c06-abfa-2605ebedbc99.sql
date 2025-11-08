-- Add external processing tracking fields to work_orders
ALTER TABLE public.work_orders
ADD COLUMN IF NOT EXISTS external_status text,
ADD COLUMN IF NOT EXISTS qty_external_wip numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS external_process_type text;

-- Create index for external processing queries
CREATE INDEX IF NOT EXISTS idx_work_orders_external_status 
ON public.work_orders(external_status) 
WHERE external_status IS NOT NULL;