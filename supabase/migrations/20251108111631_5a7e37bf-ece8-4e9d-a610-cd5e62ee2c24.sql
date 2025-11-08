-- Create material_movements table for complete tracking
CREATE TABLE IF NOT EXISTS public.material_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  process_type text NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('out', 'in')),
  qty numeric NOT NULL CHECK (qty > 0),
  weight numeric,
  partner_id uuid REFERENCES public.external_partners(id),
  timestamp timestamptz NOT NULL DEFAULT now(),
  remarks text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX idx_material_movements_wo_id ON public.material_movements(work_order_id);
CREATE INDEX idx_material_movements_process ON public.material_movements(process_type);
CREATE INDEX idx_material_movements_timestamp ON public.material_movements(timestamp DESC);
CREATE INDEX idx_material_movements_partner ON public.material_movements(partner_id) WHERE partner_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.material_movements ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view material movements"
  ON public.material_movements
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create material movements"
  ON public.material_movements
  FOR INSERT
  WITH CHECK (true);

-- Enable real-time for material_movements
ALTER PUBLICATION supabase_realtime ADD TABLE public.material_movements;

-- Add material_location to work_orders
ALTER TABLE public.work_orders
ADD COLUMN IF NOT EXISTS material_location text DEFAULT 'Factory';

-- Create trigger to update work_orders.updated_at on material movements
CREATE OR REPLACE FUNCTION notify_material_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update work order timestamp
  UPDATE public.work_orders
  SET updated_at = now()
  WHERE id = NEW.work_order_id;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER material_movement_notify
  AFTER INSERT ON public.material_movements
  FOR EACH ROW
  EXECUTE FUNCTION notify_material_movement();