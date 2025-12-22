-- Create table for machine utilisation reviews
CREATE TABLE public.machine_utilisation_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  machine_id UUID NOT NULL REFERENCES public.machines(id),
  review_date DATE NOT NULL,
  expected_runtime_minutes INTEGER NOT NULL DEFAULT 0,
  actual_runtime_minutes INTEGER NOT NULL DEFAULT 0,
  utilisation_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  reason TEXT,
  action_taken TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(machine_id, review_date)
);

-- Enable RLS
ALTER TABLE public.machine_utilisation_reviews ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view utilisation reviews"
  ON public.machine_utilisation_reviews FOR SELECT
  USING (true);

CREATE POLICY "Production and admin can manage utilisation reviews"
  ON public.machine_utilisation_reviews FOR ALL
  USING (has_role(auth.uid(), 'production'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'production'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster lookups
CREATE INDEX idx_machine_utilisation_reviews_date ON public.machine_utilisation_reviews(review_date);
CREATE INDEX idx_machine_utilisation_reviews_machine ON public.machine_utilisation_reviews(machine_id);