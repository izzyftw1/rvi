-- Create process flow map table
CREATE TABLE IF NOT EXISTS public.process_flow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_type text NOT NULL,
  next_process text,
  is_external boolean DEFAULT true,
  sequence_no integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(process_type)
);

-- Enable RLS
ALTER TABLE public.process_flow ENABLE ROW LEVEL SECURITY;

-- RLS policies for process_flow
CREATE POLICY "Anyone can view process flow"
  ON public.process_flow
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage process flow"
  ON public.process_flow
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default external process flow chain
INSERT INTO public.process_flow (process_type, next_process, is_external, sequence_no) VALUES
  ('Forging', 'Plating', true, 1),
  ('Plating', 'Buffing', true, 2),
  ('Buffing', 'Blasting', true, 3),
  ('Blasting', 'Dispatch', true, 4),
  ('Dispatch', NULL, false, 5)
ON CONFLICT (process_type) DO NOTHING;

-- Add ready_for_dispatch column to work_orders if not exists
ALTER TABLE public.work_orders
ADD COLUMN IF NOT EXISTS ready_for_dispatch boolean DEFAULT false;

-- Update existing work orders with internal forging stage to external forging
UPDATE public.work_orders
SET 
  current_stage = 'forging',
  external_status = 'pending',
  external_process_type = 'Forging'
WHERE current_stage = 'forging_queue';

-- Add trigger to update process_flow updated_at
CREATE OR REPLACE FUNCTION update_process_flow_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_process_flow_timestamp
  BEFORE UPDATE ON public.process_flow
  FOR EACH ROW
  EXECUTE FUNCTION update_process_flow_updated_at();