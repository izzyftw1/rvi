
-- Point 3: Add gate_register_id to raw_po_receipts for traceability
ALTER TABLE public.raw_po_receipts ADD COLUMN IF NOT EXISTS gate_register_id UUID REFERENCES public.gate_register(id);

-- Point 4: Make inventory_lots.alloy and material_size_mm nullable with defaults
ALTER TABLE public.inventory_lots ALTER COLUMN alloy SET DEFAULT 'N/A';
ALTER TABLE public.inventory_lots ALTER COLUMN material_size_mm SET DEFAULT 'N/A';

-- Point 12: Add weight tracking columns to wo_external_moves
ALTER TABLE public.wo_external_moves ADD COLUMN IF NOT EXISTS weight_sent_kg NUMERIC DEFAULT 0;
ALTER TABLE public.wo_external_moves ADD COLUMN IF NOT EXISTS weight_returned_kg NUMERIC DEFAULT 0;
ALTER TABLE public.wo_external_moves ADD COLUMN IF NOT EXISTS quantity_rejected NUMERIC DEFAULT 0;
ALTER TABLE public.wo_external_moves ADD COLUMN IF NOT EXISTS gate_register_id UUID REFERENCES public.gate_register(id);
