-- Add party_code and cycle_time to sales_orders
ALTER TABLE public.sales_orders 
ADD COLUMN IF NOT EXISTS party_code TEXT,
ADD COLUMN IF NOT EXISTS cycle_time_hours NUMERIC;

-- Create table to store historical item data for dropdowns
CREATE TABLE IF NOT EXISTS public.item_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code TEXT NOT NULL UNIQUE,
  alloy TEXT,
  material_size_mm NUMERIC,
  gross_weight_grams NUMERIC,
  net_weight_grams NUMERIC,
  cycle_time_hours NUMERIC,
  last_used TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create table to store historical customer data
CREATE TABLE IF NOT EXISTS public.customer_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL UNIQUE,
  party_code TEXT UNIQUE,
  last_used TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for new tables
ALTER TABLE public.item_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_master ENABLE ROW LEVEL SECURITY;

-- RLS Policies for item_master
CREATE POLICY "Authenticated users can view item master"
  ON public.item_master FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert item master"
  ON public.item_master FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update item master"
  ON public.item_master FOR UPDATE
  USING (true);

-- RLS Policies for customer_master
CREATE POLICY "Authenticated users can view customer master"
  ON public.customer_master FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert customer master"
  ON public.customer_master FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update customer master"
  ON public.customer_master FOR UPDATE
  USING (true);

-- Create trigger to update item_master when sales order is created
CREATE OR REPLACE FUNCTION update_item_master_from_sales_order()
RETURNS TRIGGER AS $$
BEGIN
  -- Update or insert item data
  INSERT INTO public.item_master (
    item_code, 
    alloy, 
    material_size_mm, 
    gross_weight_grams, 
    net_weight_grams, 
    cycle_time_hours,
    last_used
  ) VALUES (
    (NEW.items->0->>'item_code'),
    (NEW.items->0->>'alloy'),
    NEW.material_rod_forging_size_mm,
    NEW.gross_weight_per_pc_grams,
    NEW.net_weight_per_pc_grams,
    NEW.cycle_time_hours,
    now()
  )
  ON CONFLICT (item_code) 
  DO UPDATE SET
    alloy = EXCLUDED.alloy,
    material_size_mm = EXCLUDED.material_size_mm,
    gross_weight_grams = EXCLUDED.gross_weight_grams,
    net_weight_grams = EXCLUDED.net_weight_grams,
    cycle_time_hours = EXCLUDED.cycle_time_hours,
    last_used = now(),
    updated_at = now();
  
  -- Update or insert customer data
  INSERT INTO public.customer_master (
    customer_name,
    party_code,
    last_used
  ) VALUES (
    NEW.customer,
    NEW.party_code,
    now()
  )
  ON CONFLICT (customer_name)
  DO UPDATE SET
    party_code = COALESCE(EXCLUDED.party_code, customer_master.party_code),
    last_used = now(),
    updated_at = now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_update_masters_from_sales_order
  AFTER INSERT ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_item_master_from_sales_order();