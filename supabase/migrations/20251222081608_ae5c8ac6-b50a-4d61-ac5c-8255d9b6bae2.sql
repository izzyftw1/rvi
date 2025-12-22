-- Add time tracking columns to daily_production_logs
ALTER TABLE public.daily_production_logs
ADD COLUMN shift_start_time TIME NOT NULL DEFAULT '08:30:00',
ADD COLUMN shift_end_time TIME NOT NULL DEFAULT '20:00:00',
ADD COLUMN downtime_events JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN total_downtime_minutes INTEGER NOT NULL DEFAULT 0,
ADD COLUMN actual_runtime_minutes INTEGER NOT NULL DEFAULT 0;

-- Add comment for downtime_events structure
COMMENT ON COLUMN public.daily_production_logs.downtime_events IS 'Array of {reason: string, duration_minutes: number, remark?: string}';