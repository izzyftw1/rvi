-- Create table to track material requirement statuses
CREATE TABLE IF NOT EXISTS public.material_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_size_mm numeric NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'not_ordered',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.material_requirements ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view material requirements"
  ON public.material_requirements
  FOR SELECT
  USING (true);

CREATE POLICY "Purchase can manage material requirements"
  ON public.material_requirements
  FOR ALL
  USING (has_role(auth.uid(), 'purchase'::app_role));

CREATE POLICY "Admins can manage material requirements"
  ON public.material_requirements
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_material_requirements_updated_at
  BEFORE UPDATE ON public.material_requirements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for sales_orders table
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_orders;