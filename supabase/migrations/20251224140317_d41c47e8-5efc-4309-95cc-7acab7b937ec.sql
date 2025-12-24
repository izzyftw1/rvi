-- Create dispatch_notes table (Dispatch Note / Packing Slip entity)
-- This becomes the source of truth for invoicing and revenue
CREATE TABLE public.dispatch_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatch_note_no TEXT NOT NULL,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id),
  sales_order_id UUID REFERENCES public.sales_orders(id),
  carton_id UUID REFERENCES public.cartons(id),
  shipment_id UUID REFERENCES public.shipments(id),
  dispatch_id UUID REFERENCES public.dispatches(id),
  item_code TEXT NOT NULL,
  item_description TEXT,
  so_ordered_qty INTEGER, -- Original SO quantity for reference only
  packed_qty INTEGER NOT NULL DEFAULT 0,
  dispatched_qty INTEGER NOT NULL DEFAULT 0,
  rejected_qty INTEGER DEFAULT 0,
  dispatch_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  unit_rate NUMERIC,
  currency TEXT DEFAULT 'USD',
  gross_weight_kg NUMERIC,
  net_weight_kg NUMERIC,
  invoiced BOOLEAN DEFAULT false,
  invoice_id UUID REFERENCES public.invoices(id),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  remarks TEXT
);

-- Create index for performance
CREATE INDEX idx_dispatch_notes_work_order ON public.dispatch_notes(work_order_id);
CREATE INDEX idx_dispatch_notes_sales_order ON public.dispatch_notes(sales_order_id);
CREATE INDEX idx_dispatch_notes_shipment ON public.dispatch_notes(shipment_id);
CREATE INDEX idx_dispatch_notes_dispatch ON public.dispatch_notes(dispatch_id);
CREATE INDEX idx_dispatch_notes_invoiced ON public.dispatch_notes(invoiced);

-- Enable RLS
ALTER TABLE public.dispatch_notes ENABLE ROW LEVEL SECURITY;

-- Everyone can view dispatch notes
CREATE POLICY "Everyone can view dispatch notes" 
ON public.dispatch_notes 
FOR SELECT 
USING (true);

-- Logistics and admin can create dispatch notes
CREATE POLICY "Logistics and admin can create dispatch notes" 
ON public.dispatch_notes 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'logistics'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Logistics, accounts and admin can update dispatch notes
CREATE POLICY "Authorized roles can update dispatch notes" 
ON public.dispatch_notes 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'logistics'::app_role) OR 
  has_role(auth.uid(), 'accounts'::app_role) OR 
  has_role(auth.uid(), 'finance_admin'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Add column to invoice_items to store original SO quantity for reference
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS so_ordered_qty INTEGER;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS dispatch_note_id UUID REFERENCES public.dispatch_notes(id);
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS qty_override_by UUID;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS qty_override_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS qty_override_reason TEXT;

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_dispatch_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_dispatch_notes_updated_at
  BEFORE UPDATE ON public.dispatch_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_dispatch_notes_updated_at();

-- Enable realtime for dispatch_notes
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_notes;