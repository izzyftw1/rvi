-- Add QC status columns to work_orders table for single source of truth

-- Add QC material status column (replaces boolean qc_material_passed)
ALTER TABLE public.work_orders 
ADD COLUMN IF NOT EXISTS qc_material_status text DEFAULT 'pending' CHECK (qc_material_status IN ('pending', 'passed', 'failed', 'waived'));

-- Add QC first piece status column (replaces boolean qc_first_piece_passed)
ALTER TABLE public.work_orders 
ADD COLUMN IF NOT EXISTS qc_first_piece_status text DEFAULT 'pending' CHECK (qc_first_piece_status IN ('pending', 'passed', 'failed', 'waived'));

-- Add remarks columns for QC decisions
ALTER TABLE public.work_orders 
ADD COLUMN IF NOT EXISTS qc_material_remarks text,
ADD COLUMN IF NOT EXISTS qc_first_piece_remarks text;

-- Migrate existing boolean data to new status columns
-- If qc_material_passed is true, set status to 'passed', otherwise 'pending'
UPDATE public.work_orders 
SET qc_material_status = CASE 
  WHEN qc_material_passed = true THEN 'passed'
  ELSE 'pending'
END
WHERE qc_material_status = 'pending'; -- Only update if not already set

UPDATE public.work_orders 
SET qc_first_piece_status = CASE 
  WHEN qc_first_piece_passed = true THEN 'passed'
  ELSE 'pending'
END
WHERE qc_first_piece_status = 'pending'; -- Only update if not already set

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_work_orders_qc_material_status ON public.work_orders(qc_material_status);
CREATE INDEX IF NOT EXISTS idx_work_orders_qc_first_piece_status ON public.work_orders(qc_first_piece_status);

-- Add comment explaining the new columns
COMMENT ON COLUMN public.work_orders.qc_material_status IS 'QC status for raw material: pending, passed, failed, or waived';
COMMENT ON COLUMN public.work_orders.qc_first_piece_status IS 'QC status for first piece: pending, passed, failed, or waived';
COMMENT ON COLUMN public.work_orders.qc_material_remarks IS 'Optional remarks for material QC decision';
COMMENT ON COLUMN public.work_orders.qc_first_piece_remarks IS 'Optional remarks for first piece QC decision';