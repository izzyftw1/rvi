-- Add cutting_required and forging_required flags to work_orders
ALTER TABLE public.work_orders
ADD COLUMN IF NOT EXISTS cutting_required boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS forging_required boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS forging_vendor text;

-- Extend wo_stage enum to include cutting and forging stages
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'cutting_queue';
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'cutting_in_progress';
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'cutting_complete';
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'forging_queue';
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'forging_in_progress';
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'forging_complete';

-- Create cutting_records table
CREATE TABLE IF NOT EXISTS public.cutting_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  item_code text NOT NULL,
  qty_required numeric NOT NULL,
  qty_cut numeric DEFAULT 0,
  start_date timestamptz,
  end_date timestamptz,
  operator_id uuid REFERENCES auth.users(id),
  remarks text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create forging_records table
CREATE TABLE IF NOT EXISTS public.forging_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  forging_vendor text,
  sample_sent boolean DEFAULT false,
  qc_approved boolean DEFAULT false,
  qc_record_id uuid REFERENCES public.qc_records(id),
  forging_start_date date,
  forging_end_date date,
  qty_required numeric NOT NULL,
  qty_forged numeric DEFAULT 0,
  remarks text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.cutting_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forging_records ENABLE ROW LEVEL SECURITY;

-- RLS policies for cutting_records
CREATE POLICY "Authenticated users can view cutting records"
  ON public.cutting_records FOR SELECT
  USING (true);

CREATE POLICY "Production can manage cutting records"
  ON public.cutting_records FOR ALL
  USING (has_role(auth.uid(), 'production'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for forging_records
CREATE POLICY "Authenticated users can view forging records"
  ON public.forging_records FOR SELECT
  USING (true);

CREATE POLICY "Production can manage forging records"
  ON public.forging_records FOR ALL
  USING (has_role(auth.uid(), 'production'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at on cutting_records
CREATE TRIGGER update_cutting_records_updated_at
  BEFORE UPDATE ON public.cutting_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on forging_records
CREATE TRIGGER update_forging_records_updated_at
  BEFORE UPDATE ON public.forging_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to auto-update WO stage when cutting completes
CREATE OR REPLACE FUNCTION public.update_wo_stage_on_cutting_complete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE public.work_orders
    SET current_stage = 'production'::wo_stage,
        updated_at = now()
    WHERE id = NEW.work_order_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to auto-update WO stage when forging completes
CREATE OR REPLACE FUNCTION public.update_wo_stage_on_forging_complete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.qc_approved = true AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE public.work_orders
    SET current_stage = 'production'::wo_stage,
        updated_at = now()
    WHERE id = NEW.work_order_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Triggers to auto-update WO stages
CREATE TRIGGER on_cutting_complete
  AFTER UPDATE ON public.cutting_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_wo_stage_on_cutting_complete();

CREATE TRIGGER on_forging_complete
  AFTER UPDATE ON public.forging_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_wo_stage_on_forging_complete();

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.cutting_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.forging_records;