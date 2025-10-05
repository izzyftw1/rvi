-- Add status column to machines table
ALTER TABLE public.machines 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'available' CHECK (status IN ('running', 'idle', 'maintenance'));

-- Create maintenance_logs table
CREATE TABLE IF NOT EXISTS public.maintenance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  downtime_reason TEXT NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  logged_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on maintenance_logs
ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for maintenance_logs
CREATE POLICY "Authenticated users can view maintenance logs"
  ON public.maintenance_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create maintenance logs"
  ON public.maintenance_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update maintenance logs"
  ON public.maintenance_logs FOR UPDATE
  TO authenticated
  USING (true);

-- Create design_files table
CREATE TABLE IF NOT EXISTS public.design_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'dxf', 'step')),
  version INTEGER NOT NULL DEFAULT 1,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  change_notes TEXT,
  is_latest BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on design_files
ALTER TABLE public.design_files ENABLE ROW LEVEL SECURITY;

-- RLS policies for design_files
CREATE POLICY "Authenticated users can view design files"
  ON public.design_files FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Production and quality can upload design files"
  ON public.design_files FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'production'::app_role) OR has_role(auth.uid(), 'quality'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create storage bucket for design files
INSERT INTO storage.buckets (id, name, public)
VALUES ('design-files', 'design-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for design files
CREATE POLICY "Authenticated users can view design files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'design-files');

CREATE POLICY "Authorized users can upload design files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'design-files' AND
    (has_role(auth.uid(), 'production'::app_role) OR 
     has_role(auth.uid(), 'quality'::app_role) OR 
     has_role(auth.uid(), 'admin'::app_role))
  );

-- Create trigger to update updated_at on maintenance_logs
CREATE TRIGGER update_maintenance_logs_updated_at
  BEFORE UPDATE ON public.maintenance_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_machine_id ON public.maintenance_logs(machine_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_start_time ON public.maintenance_logs(start_time);
CREATE INDEX IF NOT EXISTS idx_design_files_wo_id ON public.design_files(wo_id);
CREATE INDEX IF NOT EXISTS idx_design_files_is_latest ON public.design_files(is_latest);