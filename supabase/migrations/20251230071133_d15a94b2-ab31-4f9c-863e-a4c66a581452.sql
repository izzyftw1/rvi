
-- =============================================
-- SALES ORDER WORKFLOW REFACTORING - DATABASE SCHEMA
-- Core Principle: Sales sells, Production defines manufacturing reality
-- =============================================

-- 1. CREATE material_forms lookup table
CREATE TABLE IF NOT EXISTS public.material_forms (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL UNIQUE,
    description text,
    created_at timestamptz DEFAULT now()
);

INSERT INTO public.material_forms (name, description) VALUES
    ('bar', 'Solid bar stock'),
    ('rod', 'Solid rod stock'),
    ('hex_bar', 'Hexagonal bar stock'),
    ('forging', 'Forged blank'),
    ('tube', 'Hollow tube'),
    ('plate', 'Flat plate stock'),
    ('wire', 'Wire form')
ON CONFLICT (name) DO NOTHING;

-- 2. CREATE cross_section_shapes lookup table
CREATE TABLE IF NOT EXISTS public.cross_section_shapes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL UNIQUE,
    has_inner_diameter boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

INSERT INTO public.cross_section_shapes (name, has_inner_diameter) VALUES
    ('round', false),
    ('hex', false),
    ('square', false),
    ('rectangle', false),
    ('tube', true),
    ('pipe', true),
    ('flat', false)
ON CONFLICT (name) DO NOTHING;

-- 3. CREATE material_grades lookup table
CREATE TABLE IF NOT EXISTS public.material_grades (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL UNIQUE,
    category text, -- brass, bronze, copper, stainless, etc.
    description text,
    created_at timestamptz DEFAULT now()
);

INSERT INTO public.material_grades (name, category) VALUES
    ('CuZn39Pb3', 'brass'),
    ('CuZn36Pb3', 'brass'),
    ('C36000', 'brass'),
    ('SS316L', 'stainless'),
    ('SS304', 'stainless'),
    ('C95400', 'bronze'),
    ('C95500', 'bronze'),
    ('C11000', 'copper')
ON CONFLICT (name) DO NOTHING;

-- 4. CREATE process_routes lookup table
CREATE TABLE IF NOT EXISTS public.process_routes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL UNIQUE,
    description text,
    sequence jsonb DEFAULT '[]'::jsonb, -- Array of operation steps
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

INSERT INTO public.process_routes (name, description, sequence) VALUES
    ('Standard CNC', 'Standard CNC machining route', '["cutting", "cnc_op1", "cnc_op2", "deburring", "final_qc"]'::jsonb),
    ('Heat Treat Route', 'With heat treatment', '["cutting", "cnc_op1", "heat_treatment", "cnc_op2", "final_qc"]'::jsonb),
    ('Plating Route', 'With plating process', '["cutting", "cnc_op1", "cnc_op2", "plating", "final_qc"]'::jsonb),
    ('Forging + CNC', 'From forging to CNC', '["forging", "cnc_op1", "cnc_op2", "final_qc"]'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- 5. CREATE nominal_sizes lookup table  
CREATE TABLE IF NOT EXISTS public.nominal_sizes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    size_value numeric NOT NULL,
    unit text DEFAULT 'mm',
    shape_id uuid REFERENCES public.cross_section_shapes(id),
    display_label text, -- e.g., "20 mm HEX"
    created_at timestamptz DEFAULT now(),
    UNIQUE(size_value, shape_id)
);

-- Insert common sizes
INSERT INTO public.nominal_sizes (size_value, unit, display_label)
SELECT s, 'mm', s || ' mm'
FROM unnest(ARRAY[8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 30, 32, 35, 38, 40, 45, 50]) AS s
ON CONFLICT DO NOTHING;

-- 6. RECREATE material_requirements table with full schema
-- First drop existing table if it has wrong structure
DROP TABLE IF EXISTS public.material_requirements CASCADE;

CREATE TABLE public.material_requirements (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Header References
    sales_order_id uuid REFERENCES public.sales_orders(id),
    sales_order_item_id uuid, -- FK to sales_order_items
    work_order_id uuid REFERENCES public.work_orders(id),
    item_code text NOT NULL,
    
    -- Quantity
    quantity_required integer NOT NULL,
    
    -- Status workflow: draft → approved → locked
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'locked')),
    
    -- Manufacturing Definition (editable until locked)
    process_route_id uuid REFERENCES public.process_routes(id),
    process_route_name text, -- Denormalized for display
    
    -- Raw Material Definition
    material_form text, -- bar, rod, forging, etc.
    cross_section_shape text, -- round, hex, square, etc.
    nominal_size_mm numeric,
    inner_diameter_mm numeric, -- Only for tubes/pipes
    thickness_mm numeric, -- Only for plates/flats
    material_grade text NOT NULL, -- CuZn39Pb3, SS316L, etc.
    
    -- Consumption Planning
    required_qty_kg numeric, -- Including scrap allowance
    scrap_percent numeric DEFAULT 5,
    target_net_weight_g numeric,
    target_gross_weight_g numeric,
    yield_percent numeric,
    
    -- External Processing
    external_process_required boolean DEFAULT false,
    external_supplier_id uuid REFERENCES public.external_partners(id),
    external_process_type text,
    
    -- Approval Workflow
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    approved_by uuid REFERENCES auth.users(id),
    approved_at timestamptz,
    locked_by uuid REFERENCES auth.users(id),
    locked_at timestamptz,
    
    -- Audit
    locked_reason text
);

-- Enable RLS
ALTER TABLE public.material_requirements ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Everyone can view material requirements" ON public.material_requirements
    FOR SELECT USING (true);

CREATE POLICY "Production can manage material requirements" ON public.material_requirements
    FOR ALL USING (
        has_role(auth.uid(), 'production'::app_role) OR 
        has_role(auth.uid(), 'admin'::app_role)
    );

-- Enable RLS on lookup tables
ALTER TABLE public.material_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cross_section_shapes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nominal_sizes ENABLE ROW LEVEL SECURITY;

-- RLS policies for lookup tables (everyone can view)
CREATE POLICY "Everyone can view material_forms" ON public.material_forms FOR SELECT USING (true);
CREATE POLICY "Admin can manage material_forms" ON public.material_forms FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Everyone can view cross_section_shapes" ON public.cross_section_shapes FOR SELECT USING (true);
CREATE POLICY "Admin can manage cross_section_shapes" ON public.cross_section_shapes FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Everyone can view material_grades" ON public.material_grades FOR SELECT USING (true);
CREATE POLICY "Admin can manage material_grades" ON public.material_grades FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Everyone can view process_routes" ON public.process_routes FOR SELECT USING (true);
CREATE POLICY "Admin can manage process_routes" ON public.process_routes FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Everyone can view nominal_sizes" ON public.nominal_sizes FOR SELECT USING (true);
CREATE POLICY "Admin can manage nominal_sizes" ON public.nominal_sizes FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- 7. ADD material_requirement_id to work_orders
ALTER TABLE public.work_orders 
ADD COLUMN IF NOT EXISTS material_requirement_id uuid REFERENCES public.material_requirements(id);

-- 8. ADD material_requirement_id to raw_purchase_orders
ALTER TABLE public.raw_purchase_orders 
ADD COLUMN IF NOT EXISTS material_requirement_id uuid REFERENCES public.material_requirements(id);

-- 9. ADD heat_number tracking to raw_purchase_orders
ALTER TABLE public.raw_purchase_orders 
ADD COLUMN IF NOT EXISTS heat_number text,
ADD COLUMN IF NOT EXISTS supplier_test_cert_path text,
ADD COLUMN IF NOT EXISTS incoming_qc_status text DEFAULT 'pending' CHECK (incoming_qc_status IN ('pending', 'accepted', 'rejected'));

-- 10. UPDATE item_master for engineering defaults only
ALTER TABLE public.item_master 
ADD COLUMN IF NOT EXISTS item_name text,
ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customer_master(id),
ADD COLUMN IF NOT EXISTS default_process_route_id uuid REFERENCES public.process_routes(id),
ADD COLUMN IF NOT EXISTS default_material_form text,
ADD COLUMN IF NOT EXISTS default_cross_section_shape text,
ADD COLUMN IF NOT EXISTS default_nominal_size_mm numeric,
ADD COLUMN IF NOT EXISTS default_inner_diameter_mm numeric,
ADD COLUMN IF NOT EXISTS default_material_grade text,
ADD COLUMN IF NOT EXISTS estimated_net_weight_g numeric,
ADD COLUMN IF NOT EXISTS estimated_gross_weight_g numeric,
ADD COLUMN IF NOT EXISTS estimated_cycle_time_s numeric;

-- 11. CREATE work_order_heat_issues for traceability
CREATE TABLE IF NOT EXISTS public.work_order_heat_issues (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    work_order_id uuid NOT NULL REFERENCES public.work_orders(id),
    heat_number text NOT NULL,
    quantity_pcs integer NOT NULL,
    quantity_kg numeric,
    issue_date timestamptz DEFAULT now(),
    issued_by uuid REFERENCES auth.users(id),
    rpo_id uuid REFERENCES public.raw_purchase_orders(id),
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.work_order_heat_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view heat issues" ON public.work_order_heat_issues
    FOR SELECT USING (true);

CREATE POLICY "Production and stores can manage heat issues" ON public.work_order_heat_issues
    FOR ALL USING (
        has_role(auth.uid(), 'production'::app_role) OR 
        has_role(auth.uid(), 'stores'::app_role) OR
        has_role(auth.uid(), 'admin'::app_role)
    );

-- 12. CREATE trigger to update material_requirements.updated_at
CREATE OR REPLACE FUNCTION public.update_material_requirements_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_material_requirements_updated_at ON public.material_requirements;
CREATE TRIGGER update_material_requirements_updated_at
    BEFORE UPDATE ON public.material_requirements
    FOR EACH ROW
    EXECUTE FUNCTION public.update_material_requirements_timestamp();

-- 13. ADD indexes for performance
CREATE INDEX IF NOT EXISTS idx_material_requirements_sales_order ON public.material_requirements(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_material_requirements_work_order ON public.material_requirements(work_order_id);
CREATE INDEX IF NOT EXISTS idx_material_requirements_status ON public.material_requirements(status);
CREATE INDEX IF NOT EXISTS idx_work_order_heat_issues_wo ON public.work_order_heat_issues(work_order_id);
CREATE INDEX IF NOT EXISTS idx_rpo_material_requirement ON public.raw_purchase_orders(material_requirement_id);

-- Enable realtime for material_requirements
ALTER PUBLICATION supabase_realtime ADD TABLE public.material_requirements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_order_heat_issues;
