-- Create factory_calendar_settings table
CREATE TABLE IF NOT EXISTS public.factory_calendar_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_name TEXT NOT NULL UNIQUE CHECK (day_name IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
  working BOOLEAN DEFAULT TRUE,
  day_shift_start TIME,
  day_shift_end TIME,
  night_shift_start TIME,
  night_shift_end TIME,
  break_1_start TIME,
  break_1_end TIME,
  break_2_start TIME,
  break_2_end TIME,
  overtime_allowed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default working schedule (Sat-Thu working, Friday off)
INSERT INTO public.factory_calendar_settings (day_name, working, day_shift_start, day_shift_end, night_shift_start, night_shift_end, break_1_start, break_1_end, break_2_start, break_2_end, overtime_allowed)
VALUES
  ('monday', TRUE, '08:30:00', '20:00:00', '20:00:00', '07:30:00', '12:30:00', '13:00:00', '00:00:00', '00:30:00', FALSE),
  ('tuesday', TRUE, '08:30:00', '20:00:00', '20:00:00', '07:30:00', '12:30:00', '13:00:00', '00:00:00', '00:30:00', FALSE),
  ('wednesday', TRUE, '08:30:00', '20:00:00', '20:00:00', '07:30:00', '12:30:00', '13:00:00', '00:00:00', '00:30:00', FALSE),
  ('thursday', TRUE, '08:30:00', '20:00:00', '20:00:00', '07:30:00', '12:30:00', '13:00:00', '00:00:00', '00:30:00', FALSE),
  ('friday', FALSE, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, TRUE),
  ('saturday', TRUE, '08:30:00', '20:00:00', '20:00:00', '07:30:00', '12:30:00', '13:00:00', '00:00:00', '00:30:00', FALSE),
  ('sunday', FALSE, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, FALSE)
ON CONFLICT (day_name) DO NOTHING;

-- Enable RLS
ALTER TABLE public.factory_calendar_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Allow all authenticated users to read calendar settings" ON public.factory_calendar_settings;
CREATE POLICY "Allow all authenticated users to read calendar settings"
  ON public.factory_calendar_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow admins to manage calendar settings" ON public.factory_calendar_settings;
CREATE POLICY "Allow admins to manage calendar settings"
  ON public.factory_calendar_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Create updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at_factory_calendar_settings ON public.factory_calendar_settings;
CREATE TRIGGER set_updated_at_factory_calendar_settings
  BEFORE UPDATE ON public.factory_calendar_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();