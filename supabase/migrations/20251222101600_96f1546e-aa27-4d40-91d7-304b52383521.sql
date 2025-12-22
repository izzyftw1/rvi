-- Add material lot tracking fields to qc_records for IQC traceability
ALTER TABLE public.qc_records ADD COLUMN IF NOT EXISTS material_lot_id uuid REFERENCES public.material_lots(id);
ALTER TABLE public.qc_records ADD COLUMN IF NOT EXISTS material_grade text;
ALTER TABLE public.qc_records ADD COLUMN IF NOT EXISTS heat_no text;
ALTER TABLE public.qc_records ADD COLUMN IF NOT EXISTS supplier_coa_url text;

-- Create index for faster material lot lookups
CREATE INDEX IF NOT EXISTS idx_qc_records_material_lot_id ON public.qc_records(material_lot_id);

-- Update material_lots to have proper qc_status enum values
-- Ensure qc_status can hold 'pending', 'passed', 'failed', 'hold'
COMMENT ON COLUMN public.material_lots.qc_status IS 'QC status: pending, passed, failed, hold';