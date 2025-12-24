-- Add status column to cartons table for packing workflow
ALTER TABLE public.cartons 
ADD COLUMN status TEXT NOT NULL DEFAULT 'ready_for_dispatch',
ADD COLUMN num_cartons INTEGER DEFAULT 1,
ADD COLUMN num_pallets INTEGER DEFAULT NULL;

-- Add check constraint for valid status values
ALTER TABLE public.cartons
ADD CONSTRAINT cartons_status_check 
CHECK (status IN ('packing', 'ready_for_dispatch', 'dispatched'));

-- Create index for status queries
CREATE INDEX idx_cartons_status ON public.cartons(status);
CREATE INDEX idx_cartons_wo_status ON public.cartons(wo_id, status);