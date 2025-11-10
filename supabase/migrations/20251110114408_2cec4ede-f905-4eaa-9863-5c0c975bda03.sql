-- Create material_specs master table
CREATE TABLE IF NOT EXISTS public.material_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  size_label TEXT NOT NULL UNIQUE,
  grade_label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.material_specs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for material_specs
CREATE POLICY "Everyone can view material specs"
  ON public.material_specs
  FOR SELECT
  USING (true);

CREATE POLICY "Admins and sales can manage material specs"
  ON public.material_specs
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales'::app_role));

-- Add advance_payment to sales_orders
ALTER TABLE public.sales_orders
ADD COLUMN IF NOT EXISTS advance_payment JSONB DEFAULT NULL;

-- Insert some sample material specs
INSERT INTO public.material_specs (size_label, grade_label) VALUES
  ('12mm', 'SS304'),
  ('12mm', 'SS316'),
  ('16mm', 'SS304'),
  ('16mm', 'SS316'),
  ('20mm', 'SS304'),
  ('20mm', 'SS316'),
  ('25mm', 'SS304'),
  ('25mm', 'SS316'),
  ('32mm', 'SS304'),
  ('32mm', 'SS316L'),
  ('40mm', 'SS316L'),
  ('50mm', 'SS304')
ON CONFLICT (size_label) DO NOTHING;

COMMENT ON COLUMN public.sales_orders.advance_payment IS 'Stores advance payment info: {type: "fixed" | "percentage", value: number, calculated_amount: number, currency: string}';