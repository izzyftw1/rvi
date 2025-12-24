-- Drop enum if exists from failed migration attempt
DROP TYPE IF EXISTS public.external_movement_status CASCADE;

-- Create enum for external movement status
CREATE TYPE public.external_movement_status AS ENUM (
  'sent',
  'in_transit',
  'at_partner',
  'partially_returned',
  'returned',
  'forwarded'
);

-- Create the external_movements table for proper batch-level tracking
CREATE TABLE public.external_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Batch reference (source of truth)
  batch_id uuid NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  
  -- Movement details
  process_type text NOT NULL,
  partner_id uuid REFERENCES public.external_partners(id),
  
  -- Quantity tracking
  quantity_sent integer NOT NULL CHECK (quantity_sent > 0),
  quantity_returned integer DEFAULT 0 CHECK (quantity_returned >= 0),
  quantity_rejected integer DEFAULT 0 CHECK (quantity_rejected >= 0),
  unit public.batch_unit DEFAULT 'pcs',
  
  -- Dates
  sent_date timestamp with time zone NOT NULL DEFAULT now(),
  expected_return_date date,
  actual_return_date timestamp with time zone,
  
  -- Status
  status public.external_movement_status DEFAULT 'sent',
  
  -- Forwarding support
  forwarded_from_movement_id uuid REFERENCES public.external_movements(id),
  forwarded_to_movement_id uuid REFERENCES public.external_movements(id),
  
  -- Challan/document tracking
  challan_no text,
  dc_number text,
  
  -- Metadata
  remarks text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Indexes
CREATE INDEX idx_external_movements_batch ON public.external_movements(batch_id);
CREATE INDEX idx_external_movements_wo ON public.external_movements(work_order_id);
CREATE INDEX idx_external_movements_partner ON public.external_movements(partner_id);
CREATE INDEX idx_external_movements_status ON public.external_movements(status);
CREATE INDEX idx_external_movements_process ON public.external_movements(process_type);

-- Enable RLS
ALTER TABLE public.external_movements ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Everyone can view external movements"
  ON public.external_movements FOR SELECT USING (true);

CREATE POLICY "Production and admin can manage external movements"
  ON public.external_movements FOR ALL
  USING (has_role(auth.uid(), 'production'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Logistics can manage external movements"
  ON public.external_movements FOR ALL
  USING (has_role(auth.uid(), 'logistics'::app_role));

-- Migrate existing data
INSERT INTO public.external_movements (
  batch_id, work_order_id, process_type, partner_id,
  quantity_sent, quantity_returned, sent_date, expected_return_date,
  actual_return_date, status, challan_no, remarks, created_by, created_at
)
SELECT 
  pb.id,
  wem.work_order_id,
  COALESCE(wem.process, 'Unknown'),
  wem.partner_id,
  COALESCE(wem.quantity_sent::integer, 0),
  COALESCE(wem.quantity_returned::integer, 0),
  COALESCE(wem.dispatch_date::timestamp with time zone, wem.created_at),
  wem.expected_return_date,
  wem.returned_date::timestamp with time zone,
  CASE 
    WHEN wem.status = 'returned' THEN 'returned'::external_movement_status
    WHEN COALESCE(wem.quantity_returned, 0) > 0 AND wem.quantity_returned < wem.quantity_sent THEN 'partially_returned'::external_movement_status
    ELSE 'at_partner'::external_movement_status
  END,
  wem.challan_no, wem.remarks, wem.created_by, wem.created_at
FROM public.wo_external_moves wem
INNER JOIN public.production_batches pb ON pb.wo_id = wem.work_order_id AND pb.batch_number = 1
WHERE wem.quantity_sent > 0;

-- Trigger to sync batch location
CREATE OR REPLACE FUNCTION public.sync_batch_location_from_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.production_batches
    SET current_location_type = 'external_partner', current_location_ref = NEW.partner_id,
        current_process = NEW.process_type, batch_status = 'active'
    WHERE id = NEW.batch_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'returned' THEN
    UPDATE public.production_batches
    SET current_location_type = 'factory', current_location_ref = NULL, current_process = 'post_external_qc'
    WHERE id = NEW.batch_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_batch_location
  AFTER INSERT OR UPDATE ON public.external_movements
  FOR EACH ROW EXECUTE FUNCTION public.sync_batch_location_from_movement();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.external_movements;