-- Create external_partners table
CREATE TABLE IF NOT EXISTS public.external_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_name TEXT NOT NULL,
  process_type TEXT[] NOT NULL DEFAULT '{}',
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address_line1 TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  gst_number TEXT,
  lead_time_days INTEGER DEFAULT 7,
  active BOOLEAN DEFAULT true,
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.external_partners ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view partners
CREATE POLICY "Authenticated users can view partners"
ON public.external_partners
FOR SELECT
TO authenticated
USING (true);

-- Policy: Admin can manage partners
CREATE POLICY "Admin can manage partners"
ON public.external_partners
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add updated_at trigger
CREATE TRIGGER update_external_partners_updated_at
BEFORE UPDATE ON public.external_partners
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.external_partners;