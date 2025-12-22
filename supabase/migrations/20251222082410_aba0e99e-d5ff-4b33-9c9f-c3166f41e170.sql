-- Add rejection breakdown columns to daily_production_logs
ALTER TABLE public.daily_production_logs
ADD COLUMN IF NOT EXISTS rejection_dent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rejection_scratch INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rejection_forging_mark INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rejection_lining INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rejection_dimension INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rejection_tool_mark INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rejection_setting INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rejection_previous_setup_fault INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rejection_face_not_ok INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rejection_material_not_ok INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_rejection_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ok_quantity INTEGER DEFAULT 0;