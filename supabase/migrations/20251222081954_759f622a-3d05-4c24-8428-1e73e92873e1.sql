-- Add production quantity and efficiency columns to daily_production_logs
ALTER TABLE public.daily_production_logs
ADD COLUMN target_quantity INTEGER,
ADD COLUMN target_override INTEGER,
ADD COLUMN target_override_reason TEXT,
ADD COLUMN target_override_by UUID REFERENCES auth.users(id),
ADD COLUMN actual_quantity INTEGER NOT NULL DEFAULT 0,
ADD COLUMN rework_quantity INTEGER NOT NULL DEFAULT 0,
ADD COLUMN efficiency_percentage NUMERIC(5,2);

-- Add comment for clarity
COMMENT ON COLUMN public.daily_production_logs.target_quantity IS 'Auto-calculated: (actual_runtime_minutes * 60) / cycle_time_seconds';
COMMENT ON COLUMN public.daily_production_logs.target_override IS 'Manual override of target quantity (Supervisor only)';
COMMENT ON COLUMN public.daily_production_logs.efficiency_percentage IS 'Auto-calculated: (actual_quantity / effective_target) * 100';