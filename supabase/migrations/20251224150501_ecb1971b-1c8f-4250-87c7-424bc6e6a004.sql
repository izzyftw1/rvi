-- Add production complete fields to work_orders table
ALTER TABLE public.work_orders 
ADD COLUMN IF NOT EXISTS production_complete boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS production_complete_qty integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS production_completed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS production_completed_by uuid,
ADD COLUMN IF NOT EXISTS production_complete_reason text;

-- Add comment for clarity
COMMENT ON COLUMN public.work_orders.production_complete IS 'Indicates if production is complete for this work order';
COMMENT ON COLUMN public.work_orders.production_complete_qty IS 'Quantity produced when production was marked complete';
COMMENT ON COLUMN public.work_orders.production_complete_reason IS 'Reason: qty_reached, manual, or qc_gated';