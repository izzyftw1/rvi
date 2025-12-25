-- Extend invoices table with export/domestic fields (additive only)
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS is_export BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS port_of_loading TEXT,
ADD COLUMN IF NOT EXISTS port_of_discharge TEXT,
ADD COLUMN IF NOT EXISTS incoterm TEXT,
ADD COLUMN IF NOT EXISTS hs_code TEXT,
ADD COLUMN IF NOT EXISTS country_of_origin TEXT DEFAULT 'India',
ADD COLUMN IF NOT EXISTS dispatch_id UUID REFERENCES dispatches(id),
ADD COLUMN IF NOT EXISTS dispatch_date DATE,
ADD COLUMN IF NOT EXISTS customer_address TEXT,
ADD COLUMN IF NOT EXISTS customer_contact TEXT,
ADD COLUMN IF NOT EXISTS customer_email TEXT,
ADD COLUMN IF NOT EXISTS customer_gst TEXT,
ADD COLUMN IF NOT EXISTS po_number TEXT,
ADD COLUMN IF NOT EXISTS po_date DATE,
ADD COLUMN IF NOT EXISTS final_destination TEXT,
ADD COLUMN IF NOT EXISTS vessel_flight TEXT,
ADD COLUMN IF NOT EXISTS marks_nos TEXT,
ADD COLUMN IF NOT EXISTS kind_of_packages TEXT,
ADD COLUMN IF NOT EXISTS total_gross_weight NUMERIC,
ADD COLUMN IF NOT EXISTS total_net_weight NUMERIC;

-- Add index for dispatch lookup
CREATE INDEX IF NOT EXISTS idx_invoices_dispatch_id ON invoices(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_is_export ON invoices(is_export);

-- Add comment
COMMENT ON COLUMN invoices.is_export IS 'True for export invoices, false for domestic';