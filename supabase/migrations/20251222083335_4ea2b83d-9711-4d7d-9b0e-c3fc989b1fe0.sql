-- Create CNC Programmer Activity Log table
CREATE TABLE public.cnc_programmer_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
  programmer_id UUID REFERENCES public.people(id),
  machine_id UUID REFERENCES public.machines(id),
  wo_id UUID REFERENCES public.work_orders(id),
  party_code TEXT,
  item_code TEXT,
  drawing_number TEXT,
  setup_start_time TIMESTAMP WITH TIME ZONE,
  setup_end_time TIMESTAMP WITH TIME ZONE,
  setup_duration_minutes NUMERIC GENERATED ALWAYS AS (
    CASE 
      WHEN setup_start_time IS NOT NULL AND setup_end_time IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (setup_end_time - setup_start_time)) / 60
      ELSE NULL 
    END
  ) STORED,
  first_piece_approval_time TIMESTAMP WITH TIME ZONE,
  qc_approver_id UUID REFERENCES public.people(id),
  machine_counter_reading NUMERIC,
  setup_type TEXT NOT NULL DEFAULT 'new' CHECK (setup_type IN ('new', 'repair')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.cnc_programmer_activity ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Everyone can view CNC programmer activity"
  ON public.cnc_programmer_activity
  FOR SELECT
  USING (true);

CREATE POLICY "Production can manage CNC programmer activity"
  ON public.cnc_programmer_activity
  FOR ALL
  USING (has_role(auth.uid(), 'production'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_cnc_programmer_activity_updated_at
  BEFORE UPDATE ON public.cnc_programmer_activity
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for common queries
CREATE INDEX idx_cnc_programmer_activity_date ON public.cnc_programmer_activity(activity_date);
CREATE INDEX idx_cnc_programmer_activity_programmer ON public.cnc_programmer_activity(programmer_id);