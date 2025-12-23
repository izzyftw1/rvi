-- Create production_batches table
CREATE TABLE public.production_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wo_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  batch_number INTEGER NOT NULL DEFAULT 1,
  trigger_reason TEXT NOT NULL DEFAULT 'initial' CHECK (trigger_reason IN ('initial', 'post_dispatch', 'gap_restart')),
  previous_batch_id UUID REFERENCES public.production_batches(id),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(wo_id, batch_number)
);

-- Add batch_id to daily_production_logs (nullable for backward compatibility)
ALTER TABLE public.daily_production_logs 
ADD COLUMN batch_id UUID REFERENCES public.production_batches(id);

-- Create index for efficient lookups
CREATE INDEX idx_production_batches_wo_id ON public.production_batches(wo_id);
CREATE INDEX idx_production_batches_started_at ON public.production_batches(started_at);
CREATE INDEX idx_daily_production_logs_batch_id ON public.daily_production_logs(batch_id);

-- Enable RLS
ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Everyone can view production batches"
ON public.production_batches
FOR SELECT
USING (true);

CREATE POLICY "Production can manage production batches"
ON public.production_batches
FOR ALL
USING (has_role(auth.uid(), 'production'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Function to get or create current batch for a work order
CREATE OR REPLACE FUNCTION public.get_or_create_production_batch(
  p_wo_id UUID,
  p_gap_threshold_days INTEGER DEFAULT 7
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID;
  v_last_batch RECORD;
  v_last_log_date DATE;
  v_last_dispatch_date TIMESTAMP WITH TIME ZONE;
  v_new_batch_number INTEGER;
  v_trigger_reason TEXT;
BEGIN
  -- Get the latest batch for this WO
  SELECT * INTO v_last_batch
  FROM production_batches
  WHERE wo_id = p_wo_id
  ORDER BY batch_number DESC
  LIMIT 1;

  -- If no batch exists, create initial batch
  IF v_last_batch.id IS NULL THEN
    INSERT INTO production_batches (wo_id, batch_number, trigger_reason)
    VALUES (p_wo_id, 1, 'initial')
    RETURNING id INTO v_batch_id;
    RETURN v_batch_id;
  END IF;

  -- Check for dispatch after last batch started
  SELECT MAX(s.shipped_at) INTO v_last_dispatch_date
  FROM shipments s
  JOIN shipment_items si ON si.shipment_id = s.id
  WHERE si.wo_id = p_wo_id
    AND s.shipped_at > v_last_batch.started_at
    AND s.status IN ('shipped', 'delivered');

  -- Check last production log date for this batch
  SELECT MAX(log_date) INTO v_last_log_date
  FROM daily_production_logs
  WHERE wo_id = p_wo_id
    AND batch_id = v_last_batch.id;

  -- Determine if we need a new batch
  v_trigger_reason := NULL;

  -- Case 1: Dispatch occurred after batch started - need new batch for resumed production
  IF v_last_dispatch_date IS NOT NULL THEN
    v_trigger_reason := 'post_dispatch';
  -- Case 2: Gap in production (no logs for threshold days)
  ELSIF v_last_log_date IS NOT NULL AND (CURRENT_DATE - v_last_log_date) > p_gap_threshold_days THEN
    v_trigger_reason := 'gap_restart';
  END IF;

  -- Create new batch if needed
  IF v_trigger_reason IS NOT NULL THEN
    v_new_batch_number := v_last_batch.batch_number + 1;
    
    -- Close the previous batch
    UPDATE production_batches
    SET ended_at = now()
    WHERE id = v_last_batch.id
      AND ended_at IS NULL;
    
    -- Create new batch
    INSERT INTO production_batches (wo_id, batch_number, trigger_reason, previous_batch_id)
    VALUES (p_wo_id, v_new_batch_number, v_trigger_reason, v_last_batch.id)
    RETURNING id INTO v_batch_id;
    
    RETURN v_batch_id;
  END IF;

  -- Return existing batch
  RETURN v_last_batch.id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_or_create_production_batch(UUID, INTEGER) TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE public.production_batches IS 'Tracks production batches within a work order. A new batch is auto-created when production resumes after dispatch or after a gap.';
COMMENT ON FUNCTION public.get_or_create_production_batch IS 'Gets the current active batch for a WO, or creates a new one if production resumed after dispatch/gap.';