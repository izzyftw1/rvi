-- Add pieces_per_carton to cartons table for proper packing calculations
ALTER TABLE public.cartons
ADD COLUMN IF NOT EXISTS pieces_per_carton integer;

-- Add comment for clarity
COMMENT ON COLUMN public.cartons.pieces_per_carton IS 'Number of pieces per individual carton for packing calculations';