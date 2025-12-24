-- Create finished_goods_inventory table for overproduction tracking
CREATE TABLE public.finished_goods_inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_code TEXT NOT NULL,
  customer_id UUID REFERENCES public.customer_master(id),
  customer_name TEXT,
  work_order_id UUID REFERENCES public.work_orders(id),
  production_batch_id UUID REFERENCES public.production_batches(id),
  
  -- Quantity tracking
  quantity_available INTEGER NOT NULL DEFAULT 0,
  quantity_reserved INTEGER NOT NULL DEFAULT 0,
  quantity_original INTEGER NOT NULL DEFAULT 0,
  
  -- Source info
  source_type TEXT NOT NULL DEFAULT 'overproduction', -- 'overproduction', 'customer_return', 'rework_recovery'
  unit_cost NUMERIC(12,4),
  currency TEXT DEFAULT 'USD',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_movement_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  heat_nos TEXT[],
  notes TEXT,
  created_by UUID
);

-- Create inventory movements table to track all ins/outs
CREATE TABLE public.inventory_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_id UUID NOT NULL REFERENCES public.finished_goods_inventory(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL, -- 'in_production', 'in_return', 'out_dispatch', 'out_reserved', 'adjustment'
  quantity INTEGER NOT NULL,
  
  -- References
  work_order_id UUID REFERENCES public.work_orders(id),
  dispatch_id UUID REFERENCES public.dispatches(id),
  shipment_id UUID REFERENCES public.shipments(id),
  
  -- Metadata
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create inventory reservations for pending orders
CREATE TABLE public.inventory_reservations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_id UUID NOT NULL REFERENCES public.finished_goods_inventory(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id),
  sales_order_id UUID REFERENCES public.sales_orders(id),
  
  quantity_reserved INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'consumed', 'released'
  
  reserved_by UUID,
  reserved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  consumed_at TIMESTAMP WITH TIME ZONE,
  released_at TIMESTAMP WITH TIME ZONE,
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.finished_goods_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for finished_goods_inventory
CREATE POLICY "Everyone can view finished goods inventory"
  ON public.finished_goods_inventory FOR SELECT
  USING (true);

CREATE POLICY "Production and stores can manage inventory"
  ON public.finished_goods_inventory FOR ALL
  USING (has_role(auth.uid(), 'production'::app_role) OR has_role(auth.uid(), 'stores'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for inventory_movements
CREATE POLICY "Everyone can view inventory movements"
  ON public.inventory_movements FOR SELECT
  USING (true);

CREATE POLICY "Production and stores can create movements"
  ON public.inventory_movements FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'production'::app_role) OR has_role(auth.uid(), 'stores'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for inventory_reservations
CREATE POLICY "Everyone can view reservations"
  ON public.inventory_reservations FOR SELECT
  USING (true);

CREATE POLICY "Sales and production can manage reservations"
  ON public.inventory_reservations FOR ALL
  USING (has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'production'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for performance
CREATE INDEX idx_fgi_item_code ON public.finished_goods_inventory(item_code);
CREATE INDEX idx_fgi_customer_id ON public.finished_goods_inventory(customer_id);
CREATE INDEX idx_fgi_available ON public.finished_goods_inventory(quantity_available) WHERE quantity_available > 0;
CREATE INDEX idx_inv_movements_inventory ON public.inventory_movements(inventory_id);
CREATE INDEX idx_inv_reservations_wo ON public.inventory_reservations(work_order_id);

-- Trigger to update inventory quantities on movements
CREATE OR REPLACE FUNCTION public.update_inventory_on_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.movement_type IN ('in_production', 'in_return', 'adjustment') AND NEW.quantity > 0 THEN
    UPDATE public.finished_goods_inventory
    SET quantity_available = quantity_available + NEW.quantity,
        last_movement_at = now(),
        updated_at = now()
    WHERE id = NEW.inventory_id;
  ELSIF NEW.movement_type IN ('out_dispatch', 'out_reserved') THEN
    UPDATE public.finished_goods_inventory
    SET quantity_available = GREATEST(0, quantity_available - ABS(NEW.quantity)),
        last_movement_at = now(),
        updated_at = now()
    WHERE id = NEW.inventory_id;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_inventory_on_movement
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inventory_on_movement();

-- Trigger to update reserved quantity
CREATE OR REPLACE FUNCTION public.update_inventory_reserved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.finished_goods_inventory
    SET quantity_reserved = quantity_reserved + NEW.quantity_reserved,
        updated_at = now()
    WHERE id = NEW.inventory_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status IN ('consumed', 'released') THEN
    UPDATE public.finished_goods_inventory
    SET quantity_reserved = GREATEST(0, quantity_reserved - OLD.quantity_reserved),
        updated_at = now()
    WHERE id = NEW.inventory_id;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_inventory_reserved
  AFTER INSERT OR UPDATE ON public.inventory_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inventory_reserved();

-- Create a view for inventory summary with aging
CREATE OR REPLACE VIEW public.finished_goods_summary_vw AS
SELECT 
  fgi.id,
  fgi.item_code,
  fgi.customer_id,
  fgi.customer_name,
  fgi.quantity_available,
  fgi.quantity_reserved,
  fgi.quantity_original,
  fgi.source_type,
  fgi.created_at,
  fgi.last_movement_at,
  wo.wo_number,
  wo.item_code as wo_item_code,
  EXTRACT(DAY FROM now() - fgi.created_at)::INTEGER as age_days,
  CASE 
    WHEN EXTRACT(DAY FROM now() - fgi.created_at) <= 30 THEN 'fresh'
    WHEN EXTRACT(DAY FROM now() - fgi.created_at) <= 90 THEN 'normal'
    WHEN EXTRACT(DAY FROM now() - fgi.created_at) <= 180 THEN 'aging'
    ELSE 'stale'
  END as age_category
FROM public.finished_goods_inventory fgi
LEFT JOIN public.work_orders wo ON fgi.work_order_id = wo.id
WHERE fgi.quantity_available > 0;