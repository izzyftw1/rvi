-- ========================================
-- GATE REGISTER: Unified Goods In/Out System
-- Weight-based tracking, source of truth for logistics
-- ========================================

-- 1. Packaging Types Master (for tare weight calculation)
CREATE TABLE IF NOT EXISTS public.packaging_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('bag', 'crate', 'box', 'drum', 'loose')),
  tare_weight_kg numeric(10,3) NOT NULL DEFAULT 0,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default packaging types
INSERT INTO public.packaging_types (name, type, tare_weight_kg, description) VALUES
  ('PP Bag - Small', 'bag', 0.15, 'Small polypropylene bag'),
  ('PP Bag - Medium', 'bag', 0.25, 'Medium polypropylene bag'),
  ('PP Bag - Large', 'bag', 0.35, 'Large polypropylene bag'),
  ('Gunny Bag', 'bag', 0.50, 'Jute gunny bag'),
  ('Wooden Crate - Small', 'crate', 5.0, 'Small wooden crate'),
  ('Wooden Crate - Medium', 'crate', 8.0, 'Medium wooden crate'),
  ('Wooden Crate - Large', 'crate', 12.0, 'Large wooden crate'),
  ('Cardboard Box', 'box', 0.8, 'Standard cardboard box'),
  ('Metal Drum', 'drum', 15.0, 'Metal drum container'),
  ('Loose (No Packaging)', 'loose', 0, 'No packaging - loose material')
ON CONFLICT (name) DO NOTHING;

-- 2. Gate Register: Unified entry point for all goods in/out
CREATE TABLE IF NOT EXISTS public.gate_register (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gate_entry_no text NOT NULL UNIQUE,
  direction text NOT NULL CHECK (direction IN ('IN', 'OUT')),
  material_type text NOT NULL CHECK (material_type IN ('raw_material', 'external_process', 'finished_goods', 'scrap', 'other')),
  
  -- Common fields
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  entry_time timestamptz NOT NULL DEFAULT now(),
  
  -- Material identification
  item_name text,
  rod_section_size text,
  material_grade text,
  alloy text,
  heat_no text,
  tc_number text,
  
  -- Weight tracking (source of truth)
  gross_weight_kg numeric(12,3) NOT NULL,
  packaging_type_id uuid REFERENCES public.packaging_types(id),
  packaging_count integer DEFAULT 1,
  tare_weight_kg numeric(12,3) DEFAULT 0,
  net_weight_kg numeric(12,3) GENERATED ALWAYS AS (gross_weight_kg - tare_weight_kg) STORED,
  
  -- Piece estimation (auto-calculated from item master if available)
  estimated_pcs integer,
  unit text DEFAULT 'kg',
  
  -- Parties
  supplier_id uuid REFERENCES public.suppliers(id),
  supplier_name text,
  customer_id uuid REFERENCES public.customer_master(id),
  party_code text,
  partner_id uuid REFERENCES public.external_partners(id),
  
  -- Process info (for external process returns)
  process_type text,
  
  -- Document references
  challan_no text,
  dc_number text,
  invoice_no text,
  lr_no text,
  transporter text,
  vehicle_no text,
  
  -- Links (optional - weight entry is standalone, links are bonus)
  rpo_id uuid REFERENCES public.raw_purchase_orders(id),
  work_order_id uuid REFERENCES public.work_orders(id),
  external_movement_id uuid REFERENCES public.external_movements(id),
  
  -- Status & audit
  status text DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'cancelled')),
  qc_required boolean DEFAULT false,
  qc_status text DEFAULT 'pending' CHECK (qc_status IN ('pending', 'passed', 'failed', 'not_required')),
  remarks text,
  
  -- Tag/Challan printing
  tag_printed boolean DEFAULT false,
  tag_printed_at timestamptz,
  challan_printed boolean DEFAULT false,
  challan_printed_at timestamptz,
  
  -- Audit
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_gate_register_date ON public.gate_register(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_gate_register_direction ON public.gate_register(direction);
CREATE INDEX IF NOT EXISTS idx_gate_register_material_type ON public.gate_register(material_type);
CREATE INDEX IF NOT EXISTS idx_gate_register_heat_no ON public.gate_register(heat_no);
CREATE INDEX IF NOT EXISTS idx_gate_register_challan_no ON public.gate_register(challan_no);

-- Enable RLS
ALTER TABLE public.packaging_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_register ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow authenticated users to view and manage
CREATE POLICY "Authenticated users can view packaging types"
ON public.packaging_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage packaging types"
ON public.packaging_types FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view gate register"
ON public.gate_register FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage gate register"
ON public.gate_register FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Function to generate gate entry number
CREATE OR REPLACE FUNCTION public.generate_gate_entry_no(direction text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_number INTEGER;
  prefix TEXT;
  date_str TEXT;
BEGIN
  date_str := TO_CHAR(CURRENT_DATE, 'YYMMDD');
  prefix := CASE direction WHEN 'IN' THEN 'GIN' ELSE 'GOUT' END;
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(gate_entry_no FROM prefix || '-' || date_str || '-(\d+)') AS INTEGER)), 0) + 1
  INTO next_number
  FROM gate_register
  WHERE gate_entry_no LIKE prefix || '-' || date_str || '-%';
  
  RETURN prefix || '-' || date_str || '-' || LPAD(next_number::TEXT, 4, '0');
END;
$$;

-- 4. Trigger to auto-generate gate entry number
CREATE OR REPLACE FUNCTION public.auto_generate_gate_entry_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.gate_entry_no IS NULL OR NEW.gate_entry_no = '' THEN
    NEW.gate_entry_no := generate_gate_entry_no(NEW.direction);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_gate_entry_no ON public.gate_register;
CREATE TRIGGER trg_auto_gate_entry_no
  BEFORE INSERT ON public.gate_register
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_gate_entry_no();

-- 5. Trigger to update inventory on gate register entry
CREATE OR REPLACE FUNCTION public.gate_register_to_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only for completed raw material IN entries with heat number
  IF NEW.direction = 'IN' AND NEW.material_type = 'raw_material' 
     AND NEW.status = 'completed' AND NEW.heat_no IS NOT NULL THEN
    
    -- Create material_lots entry
    INSERT INTO public.material_lots (
      lot_id,
      heat_no,
      alloy,
      material_size_mm,
      gross_weight,
      net_weight,
      supplier,
      status,
      qc_status,
      received_by
    ) VALUES (
      'LOT-' || NEW.gate_entry_no,
      NEW.heat_no,
      COALESCE(NEW.alloy, 'Unknown'),
      NEW.rod_section_size,
      NEW.gross_weight_kg,
      NEW.net_weight_kg,
      COALESCE(NEW.supplier_name, 'Unknown'),
      'received',
      CASE WHEN NEW.qc_required THEN 'pending' ELSE 'not_required' END,
      NEW.created_by
    ) ON CONFLICT (lot_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gate_to_inventory ON public.gate_register;
CREATE TRIGGER trg_gate_to_inventory
  AFTER INSERT ON public.gate_register
  FOR EACH ROW
  EXECUTE FUNCTION public.gate_register_to_inventory();

-- 6. Updated_at trigger
DROP TRIGGER IF EXISTS update_gate_register_updated_at ON public.gate_register;
CREATE TRIGGER update_gate_register_updated_at
  BEFORE UPDATE ON public.gate_register
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.gate_register;