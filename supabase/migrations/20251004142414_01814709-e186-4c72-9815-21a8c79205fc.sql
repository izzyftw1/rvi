-- Add sales orders table
CREATE TABLE public.sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  so_id TEXT UNIQUE NOT NULL,
  customer TEXT NOT NULL,
  po_number TEXT NOT NULL,
  po_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'converted_to_wo')),
  items JSONB NOT NULL,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add purchase orders table
CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id TEXT UNIQUE NOT NULL,
  so_id UUID REFERENCES public.sales_orders(id),
  supplier TEXT NOT NULL,
  material_spec JSONB NOT NULL,
  quantity_kg NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'received', 'cancelled')),
  expected_delivery DATE,
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add laser marking events
CREATE TABLE public.laser_marking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carton_id UUID REFERENCES public.cartons(id),
  marking_details JSONB NOT NULL,
  marked_by UUID REFERENCES auth.users(id),
  marked_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  station TEXT
);

-- Add notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enhance material_lots with QC gate
ALTER TABLE public.material_lots ADD COLUMN qc_status TEXT DEFAULT 'pending' CHECK (qc_status IN ('pending', 'pass', 'fail', 'hold'));
ALTER TABLE public.material_lots ADD COLUMN po_id UUID REFERENCES public.purchase_orders(id);

-- Enhance work_orders with SO reference and QC gate
ALTER TABLE public.work_orders ADD COLUMN so_id UUID REFERENCES public.sales_orders(id);
ALTER TABLE public.work_orders ADD COLUMN production_allowed BOOLEAN DEFAULT false;
ALTER TABLE public.work_orders ADD COLUMN dispatch_allowed BOOLEAN DEFAULT false;

-- Enhance routing_steps with consumed quantities
ALTER TABLE public.routing_steps ADD COLUMN consumed_qty NUMERIC;

-- Enable RLS
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laser_marking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Sales orders policies
CREATE POLICY "Authenticated users can view sales orders"
  ON public.sales_orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Sales can create sales orders"
  ON public.sales_orders FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'sales'));

CREATE POLICY "Sales can update sales orders"
  ON public.sales_orders FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'sales'));

-- Purchase orders policies
CREATE POLICY "Authenticated users can view purchase orders"
  ON public.purchase_orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Purchase can manage purchase orders"
  ON public.purchase_orders FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'purchase'));

-- Laser marking policies
CREATE POLICY "Authenticated users can view laser marking"
  ON public.laser_marking FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Packing can create laser marking"
  ON public.laser_marking FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'packing'));

-- Notifications policies
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can create notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_sales_orders_updated_at
  BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to notify users
CREATE OR REPLACE FUNCTION public.notify_users(
  _user_ids UUID[],
  _type TEXT,
  _title TEXT,
  _message TEXT,
  _entity_type TEXT DEFAULT NULL,
  _entity_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
BEGIN
  FOREACH _user_id IN ARRAY _user_ids
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id)
    VALUES (_user_id, _type, _title, _message, _entity_type, _entity_id);
  END LOOP;
END;
$$;