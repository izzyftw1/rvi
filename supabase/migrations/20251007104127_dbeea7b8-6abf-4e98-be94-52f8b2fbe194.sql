-- Update the status check constraint to allow 'draft' status
ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_status_check 
  CHECK (status IN ('draft', 'pending', 'approved', 'completed', 'cancelled'));