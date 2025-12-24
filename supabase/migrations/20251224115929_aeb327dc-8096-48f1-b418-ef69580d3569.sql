
-- Add shipment_id to invoices table to link invoices to dispatched shipments
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS shipment_id UUID REFERENCES public.shipments(id);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_invoices_shipment_id ON public.invoices(shipment_id);

-- Add comment to clarify the new invoicing model
COMMENT ON COLUMN public.invoices.shipment_id IS 'Links invoice to dispatched shipment. Invoices must be created from dispatched quantities, not sales order quantities.';

-- Add dispatch_id to invoice_items to track which dispatch record each line item came from
ALTER TABLE public.invoice_items 
ADD COLUMN IF NOT EXISTS dispatch_id UUID REFERENCES public.dispatches(id);

-- Add wo_id to invoice_items for easier traceability
ALTER TABLE public.invoice_items 
ADD COLUMN IF NOT EXISTS wo_id UUID REFERENCES public.work_orders(id);

-- Add item_code to invoice_items for better identification
ALTER TABLE public.invoice_items 
ADD COLUMN IF NOT EXISTS item_code TEXT;
