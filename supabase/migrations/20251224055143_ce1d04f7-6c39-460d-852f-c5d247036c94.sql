-- Create dispatch_qc_batches table for batch-level QC tracking
CREATE TABLE public.dispatch_qc_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  production_batch_id UUID REFERENCES public.production_batches(id) ON DELETE SET NULL,
  qc_batch_id TEXT NOT NULL,
  qc_approved_quantity INTEGER NOT NULL CHECK (qc_approved_quantity > 0),
  consumed_quantity INTEGER NOT NULL DEFAULT 0 CHECK (consumed_quantity >= 0),
  qc_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  approved_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'partially_consumed', 'consumed')),
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure consumed doesn't exceed approved
  CONSTRAINT consumed_not_exceed_approved CHECK (consumed_quantity <= qc_approved_quantity)
);

-- Create unique constraint on qc_batch_id
ALTER TABLE public.dispatch_qc_batches ADD CONSTRAINT dispatch_qc_batches_qc_batch_id_key UNIQUE (qc_batch_id);

-- Create indexes
CREATE INDEX idx_dispatch_qc_batches_wo ON public.dispatch_qc_batches(work_order_id);
CREATE INDEX idx_dispatch_qc_batches_status ON public.dispatch_qc_batches(status);
CREATE INDEX idx_dispatch_qc_batches_prod_batch ON public.dispatch_qc_batches(production_batch_id);

-- Enable RLS
ALTER TABLE public.dispatch_qc_batches ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Everyone can view dispatch QC batches"
  ON public.dispatch_qc_batches FOR SELECT
  USING (true);

CREATE POLICY "Quality and admin can manage dispatch QC batches"
  ON public.dispatch_qc_batches FOR ALL
  USING (has_role(auth.uid(), 'quality') OR has_role(auth.uid(), 'admin'));

-- Add dispatch_qc_batch_id to cartons for tracking which QC batch was consumed
ALTER TABLE public.cartons 
ADD COLUMN dispatch_qc_batch_id UUID REFERENCES public.dispatch_qc_batches(id);

-- Create trigger to update status when consumed_quantity changes
CREATE OR REPLACE FUNCTION public.update_dispatch_qc_batch_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.consumed_quantity >= NEW.qc_approved_quantity THEN
    NEW.status := 'consumed';
  ELSIF NEW.consumed_quantity > 0 THEN
    NEW.status := 'partially_consumed';
  ELSE
    NEW.status := 'approved';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_update_dispatch_qc_status
  BEFORE UPDATE OF consumed_quantity ON public.dispatch_qc_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_dispatch_qc_batch_status();

-- Function to generate QC batch ID
CREATE OR REPLACE FUNCTION public.generate_dispatch_qc_batch_id()
RETURNS TEXT AS $$
DECLARE
  next_number INTEGER;
  year_suffix TEXT;
BEGIN
  year_suffix := TO_CHAR(CURRENT_DATE, 'YY');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(qc_batch_id FROM 'DQC-(\d+)-') AS INTEGER)), 0) + 1
  INTO next_number
  FROM dispatch_qc_batches
  WHERE qc_batch_id LIKE 'DQC-%-' || year_suffix;
  
  RETURN 'DQC-' || LPAD(next_number::TEXT, 5, '0') || '-' || year_suffix;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to auto-generate qc_batch_id
CREATE OR REPLACE FUNCTION public.auto_generate_dispatch_qc_batch_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.qc_batch_id IS NULL OR NEW.qc_batch_id = '' THEN
    NEW.qc_batch_id := generate_dispatch_qc_batch_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_auto_generate_dispatch_qc_batch_id
  BEFORE INSERT ON public.dispatch_qc_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_dispatch_qc_batch_id();

-- Function to update consumed quantity when carton is created
CREATE OR REPLACE FUNCTION public.update_dispatch_qc_consumed_on_pack()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.dispatch_qc_batch_id IS NOT NULL THEN
    UPDATE public.dispatch_qc_batches
    SET consumed_quantity = consumed_quantity + NEW.quantity
    WHERE id = NEW.dispatch_qc_batch_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_update_dispatch_qc_on_pack
  AFTER INSERT ON public.cartons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_dispatch_qc_consumed_on_pack();

-- Function to reverse consumed quantity on carton delete
CREATE OR REPLACE FUNCTION public.reverse_dispatch_qc_consumed_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.dispatch_qc_batch_id IS NOT NULL THEN
    UPDATE public.dispatch_qc_batches
    SET consumed_quantity = GREATEST(0, consumed_quantity - OLD.quantity)
    WHERE id = OLD.dispatch_qc_batch_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_reverse_dispatch_qc_on_delete
  BEFORE DELETE ON public.cartons
  FOR EACH ROW
  EXECUTE FUNCTION public.reverse_dispatch_qc_consumed_on_delete();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_qc_batches;