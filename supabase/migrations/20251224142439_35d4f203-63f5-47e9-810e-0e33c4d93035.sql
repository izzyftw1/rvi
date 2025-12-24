-- Update tds_records status column to use clearer status values
-- Current values: pending, filed, paid
-- New values: deducted (at source), deposited (to govt), claimed (in returns)

-- First, update existing data to new status values
UPDATE public.tds_records
SET status = 'deducted'
WHERE status = 'pending';

UPDATE public.tds_records
SET status = 'deposited'
WHERE status = 'filed';

UPDATE public.tds_records
SET status = 'claimed'
WHERE status = 'paid';

-- Add comments to document the status workflow
COMMENT ON COLUMN public.tds_records.status IS 'TDS lifecycle: deducted -> deposited -> claimed. Deducted = TDS deducted at source, Deposited = Remitted to government, Claimed = Included in tax returns';

-- Create index for faster status-based queries
CREATE INDEX IF NOT EXISTS idx_tds_records_status ON public.tds_records(status);
CREATE INDEX IF NOT EXISTS idx_tds_records_fy_quarter ON public.tds_records(financial_year, quarter);