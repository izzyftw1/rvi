-- Create purchase_settings table
CREATE TABLE IF NOT EXISTS public.purchase_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_variance_tolerance_percent NUMERIC NOT NULL DEFAULT 5.0,
  require_reason_on_override BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.purchase_settings ENABLE ROW LEVEL SECURITY;

-- Policies for purchase_settings
CREATE POLICY "Anyone can view purchase settings"
ON public.purchase_settings
FOR SELECT
USING (true);

CREATE POLICY "Purchase and admin can update settings"
ON public.purchase_settings
FOR UPDATE
USING (has_role(auth.uid(), 'purchase'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'purchase'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Purchase and admin can insert settings"
ON public.purchase_settings
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'purchase'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Insert default settings
INSERT INTO public.purchase_settings (rate_variance_tolerance_percent, require_reason_on_override)
VALUES (5.0, true);

-- Add trigger for updated_at
CREATE TRIGGER update_purchase_settings_updated_at
BEFORE UPDATE ON public.purchase_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();