-- Create factory_calendar_exceptions table
CREATE TABLE IF NOT EXISTS public.factory_calendar_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_date DATE NOT NULL UNIQUE,
  is_working BOOLEAN NOT NULL DEFAULT FALSE,
  override_shift_start TIME,
  override_shift_end TIME,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.factory_calendar_exceptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "All authenticated users can view exceptions"
  ON public.factory_calendar_exceptions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage exceptions"
  ON public.factory_calendar_exceptions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );