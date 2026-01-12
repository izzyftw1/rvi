-- Add rejected_quantity column to dispatch_qc_batches
-- This allows tracking of rejected quantities separately from approved
-- Rejected quantities will never flow to packing/dispatch
ALTER TABLE public.dispatch_qc_batches
ADD COLUMN IF NOT EXISTS rejected_quantity integer NOT NULL DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.dispatch_qc_batches.rejected_quantity IS 'Quantity rejected during this Dispatch QC event. Never flows to packing/dispatch.';
COMMENT ON COLUMN public.dispatch_qc_batches.qc_approved_quantity IS 'Quantity approved for packing during this Dispatch QC event.';
COMMENT ON COLUMN public.dispatch_qc_batches.consumed_quantity IS 'Quantity already consumed (packed) from this QC batch.';