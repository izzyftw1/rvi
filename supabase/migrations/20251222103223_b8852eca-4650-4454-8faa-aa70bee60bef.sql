-- Add source and linkage fields to NCRs
ALTER TABLE public.ncrs
ADD COLUMN IF NOT EXISTS raised_from TEXT CHECK (raised_from IN ('incoming_qc', 'inprocess_qc', 'final_qc', 'production')),
ADD COLUMN IF NOT EXISTS material_lot_id UUID REFERENCES public.inventory_lots(id),
ADD COLUMN IF NOT EXISTS production_log_id UUID REFERENCES public.daily_production_logs(id),
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS action_due_date DATE,
ADD COLUMN IF NOT EXISTS action_completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS action_completed_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS action_notes TEXT,
ADD COLUMN IF NOT EXISTS closure_notes TEXT;

-- Create NCR actions table for tracking multiple actions
CREATE TABLE IF NOT EXISTS public.ncr_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ncr_id UUID NOT NULL REFERENCES public.ncrs(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('corrective', 'preventive', 'containment')),
  description TEXT NOT NULL,
  assigned_to UUID REFERENCES auth.users(id),
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'verified')),
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID REFERENCES auth.users(id),
  completion_notes TEXT,
  verification_notes TEXT,
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on ncr_actions
ALTER TABLE public.ncr_actions ENABLE ROW LEVEL SECURITY;

-- RLS policies for ncr_actions
CREATE POLICY "Anyone can view NCR actions"
  ON public.ncr_actions FOR SELECT
  USING (true);

CREATE POLICY "Quality can manage NCR actions"
  ON public.ncr_actions FOR ALL
  USING (has_role(auth.uid(), 'quality') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Assigned users can update their actions"
  ON public.ncr_actions FOR UPDATE
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

-- Create updated_at trigger for ncr_actions
CREATE TRIGGER update_ncr_actions_updated_at
  BEFORE UPDATE ON public.ncr_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE public.ncr_actions IS 'Tracks corrective, preventive, and containment actions for NCRs';