
-- Create enum for person role
CREATE TYPE public.person_role AS ENUM ('operator', 'programmer', 'qc_inspector');

-- Create enum for employment type
CREATE TYPE public.employment_type AS ENUM ('internal', 'agency');

-- Create people table for operators, programmers, QC inspectors
CREATE TABLE public.people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  role person_role NOT NULL,
  employment_type employment_type NOT NULL DEFAULT 'internal',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view people"
  ON public.people FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage people"
  ON public.people FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Create index for common queries
CREATE INDEX idx_people_role ON public.people(role);
CREATE INDEX idx_people_active ON public.people(is_active);

-- Trigger for updated_at
CREATE TRIGGER update_people_updated_at
  BEFORE UPDATE ON public.people
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
