-- Create setter_activity_ledger table to track setup activity separately from production metrics
-- This data does NOT affect production efficiency calculations

CREATE TABLE IF NOT EXISTS public.setter_activity_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_log_id UUID REFERENCES public.daily_production_logs(id) ON DELETE CASCADE,
  work_order_id UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
  machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  setter_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  log_date DATE NOT NULL,
  setup_number TEXT NOT NULL,
  setup_start_time TIME,
  setup_end_time TIME,
  setup_duration_minutes INTEGER,
  is_repeat_setup BOOLEAN DEFAULT FALSE,
  delay_caused_minutes INTEGER DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add indexes for efficient querying
CREATE INDEX idx_setter_ledger_setter ON public.setter_activity_ledger(setter_id);
CREATE INDEX idx_setter_ledger_date ON public.setter_activity_ledger(log_date);
CREATE INDEX idx_setter_ledger_machine ON public.setter_activity_ledger(machine_id);

-- Enable RLS
ALTER TABLE public.setter_activity_ledger ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view setter activity"
  ON public.setter_activity_ledger FOR SELECT
  USING (true);

CREATE POLICY "Production can manage setter activity"
  ON public.setter_activity_ledger FOR ALL
  USING (has_role(auth.uid(), 'production'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Add setter fields to daily_production_logs if not already present
ALTER TABLE public.daily_production_logs
  ADD COLUMN IF NOT EXISTS setter_id UUID REFERENCES public.people(id),
  ADD COLUMN IF NOT EXISTS setup_start_time_actual TIME,
  ADD COLUMN IF NOT EXISTS setup_end_time_actual TIME,
  ADD COLUMN IF NOT EXISTS setup_duration_minutes INTEGER;

-- Add comment for documentation
COMMENT ON TABLE public.setter_activity_ledger IS 'Tracks setter/programmer setup activity separately from production metrics. Does not affect production efficiency calculations.';