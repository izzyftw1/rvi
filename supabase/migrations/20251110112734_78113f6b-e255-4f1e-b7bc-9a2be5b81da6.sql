-- Create QC Final Reports table if not exists
CREATE TABLE IF NOT EXISTS public.qc_final_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  generated_by UUID REFERENCES auth.users(id),
  generated_at TIMESTAMPTZ DEFAULT now(),
  file_url TEXT NOT NULL,
  file_path TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  remarks TEXT,
  report_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster lookups (only if not exists)
CREATE INDEX IF NOT EXISTS idx_qc_final_reports_wo ON public.qc_final_reports(work_order_id);

-- Enable RLS
ALTER TABLE public.qc_final_reports ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view QC final reports" ON public.qc_final_reports;
DROP POLICY IF EXISTS "Quality and admin can manage QC final reports" ON public.qc_final_reports;

-- RLS Policies
CREATE POLICY "Anyone can view QC final reports"
  ON public.qc_final_reports FOR SELECT
  USING (true);

CREATE POLICY "Quality and admin can manage QC final reports"
  ON public.qc_final_reports FOR ALL
  USING (
    has_role(auth.uid(), 'quality'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'production'::app_role)
  );

-- Create storage bucket for QC reports
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'qc-reports',
  'qc-reports',
  false,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Authenticated users can view QC reports" ON storage.objects;
DROP POLICY IF EXISTS "Quality users can upload QC reports" ON storage.objects;
DROP POLICY IF EXISTS "Quality users can update QC reports" ON storage.objects;

-- Storage RLS Policies
CREATE POLICY "Authenticated users can view QC reports"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'qc-reports' AND auth.role() = 'authenticated');

CREATE POLICY "Quality users can upload QC reports"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'qc-reports' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Quality users can update QC reports"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'qc-reports' AND
    auth.role() = 'authenticated'
  );