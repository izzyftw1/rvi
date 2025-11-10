-- Create material_master table for standardized material grades
CREATE TABLE IF NOT EXISTS public.material_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_name TEXT NOT NULL UNIQUE,
  size_mm NUMERIC NOT NULL,
  alloy TEXT NOT NULL,
  shape_type TEXT NOT NULL CHECK (shape_type IN ('HEX', 'ROUND', 'HOLLOW', 'SQUARE', 'FLAT')),
  density NUMERIC NOT NULL DEFAULT 8.9,
  conversion_factor NUMERIC DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create material_requirements table for tracking requirements per WO
CREATE TABLE IF NOT EXISTS public.material_requirements_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  so_id UUID REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  wo_id UUID REFERENCES public.work_orders(id) ON DELETE CASCADE,
  material_grade TEXT NOT NULL,
  material_size_mm NUMERIC NOT NULL,
  alloy TEXT NOT NULL,
  qty_pcs INTEGER NOT NULL,
  gross_wt_pc NUMERIC NOT NULL,
  net_wt_pc NUMERIC NOT NULL,
  total_gross_kg NUMERIC GENERATED ALWAYS AS (qty_pcs * gross_wt_pc / 1000.0) STORED,
  total_net_kg NUMERIC GENERATED ALWAYS AS (qty_pcs * net_wt_pc / 1000.0) STORED,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ordered', 'partial', 'fulfilled')),
  customer TEXT NOT NULL,
  customer_id UUID REFERENCES public.customer_master(id),
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.material_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_requirements_v2 ENABLE ROW LEVEL SECURITY;

-- RLS policies for material_master
CREATE POLICY "Everyone can view material master"
  ON public.material_master FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage material master"
  ON public.material_master FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for material_requirements_v2
CREATE POLICY "Everyone can view material requirements"
  ON public.material_requirements_v2 FOR SELECT
  USING (true);

CREATE POLICY "System can insert material requirements"
  ON public.material_requirements_v2 FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Purchase and admin can update material requirements"
  ON public.material_requirements_v2 FOR UPDATE
  USING (has_role(auth.uid(), 'purchase'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for performance
CREATE INDEX idx_material_requirements_v2_so_id ON public.material_requirements_v2(so_id);
CREATE INDEX idx_material_requirements_v2_wo_id ON public.material_requirements_v2(wo_id);
CREATE INDEX idx_material_requirements_v2_material_grade ON public.material_requirements_v2(material_grade);
CREATE INDEX idx_material_requirements_v2_status ON public.material_requirements_v2(status);

-- Trigger to update updated_at
CREATE TRIGGER update_material_master_updated_at
  BEFORE UPDATE ON public.material_master
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_material_requirements_v2_updated_at
  BEFORE UPDATE ON public.material_requirements_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to auto-populate material_requirements when WO is created
CREATE OR REPLACE FUNCTION public.auto_create_material_requirement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create material requirement entry when WO is created from SO
  IF NEW.so_id IS NOT NULL AND NEW.material_size_mm IS NOT NULL THEN
    INSERT INTO public.material_requirements_v2 (
      so_id,
      wo_id,
      material_grade,
      material_size_mm,
      alloy,
      qty_pcs,
      gross_wt_pc,
      net_wt_pc,
      customer,
      customer_id,
      due_date,
      status
    )
    SELECT
      NEW.so_id,
      NEW.id,
      NEW.material_size_mm || ' - ' || COALESCE(
        (NEW.financial_snapshot->'line_item'->>'alloy')::text,
        'Unknown'
      ),
      NEW.material_size_mm::numeric,
      COALESCE((NEW.financial_snapshot->'line_item'->>'alloy')::text, 'Unknown'),
      NEW.quantity,
      NEW.gross_weight_per_pc,
      NEW.net_weight_per_pc,
      NEW.customer,
      NEW.customer_id,
      NEW.due_date,
      'pending'
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to auto-create material requirements on WO creation
CREATE TRIGGER auto_create_material_requirement_on_wo
  AFTER INSERT ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_material_requirement();

-- Insert some default material master data
INSERT INTO public.material_master (material_name, size_mm, alloy, shape_type, density) VALUES
  ('22MM HEX', 22, 'C36000', 'HEX', 8.5),
  ('19MM HEX', 19, 'C36000', 'HEX', 8.5),
  ('25MM HEX', 25, 'C36000', 'HEX', 8.5),
  ('16MM ROUND', 16, 'C11000', 'ROUND', 8.9),
  ('20MM ROUND', 20, 'C11000', 'ROUND', 8.9),
  ('25MM ROUND', 25, 'C26000', 'ROUND', 8.5)
ON CONFLICT (material_name) DO NOTHING;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.material_requirements_v2;