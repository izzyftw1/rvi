-- Add quality release fields to work_orders table
ALTER TABLE public.work_orders 
ADD COLUMN IF NOT EXISTS quality_released BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS quality_released_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS quality_released_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS sampling_plan_reference TEXT,
ADD COLUMN IF NOT EXISTS final_qc_result TEXT CHECK (final_qc_result IN ('passed', 'blocked', 'pending')),
ADD COLUMN IF NOT EXISTS traceability_frozen BOOLEAN NOT NULL DEFAULT false;

-- Add production_log_locked field to daily_production_logs
ALTER TABLE public.daily_production_logs
ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS locked_reason TEXT;

-- Create function to lock production logs when WO is quality released
CREATE OR REPLACE FUNCTION public.lock_production_logs_on_quality_release()
RETURNS TRIGGER AS $$
BEGIN
  -- When work order is quality released, lock all associated production logs
  IF NEW.quality_released = true AND OLD.quality_released = false THEN
    UPDATE public.daily_production_logs
    SET 
      locked = true,
      locked_at = NOW(),
      locked_by = NEW.quality_released_by,
      locked_reason = 'Quality Released'
    WHERE wo_id = NEW.id;
    
    -- Also freeze traceability
    NEW.traceability_frozen = true;
    NEW.production_locked = true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for quality release locking
DROP TRIGGER IF EXISTS trigger_lock_on_quality_release ON public.work_orders;
CREATE TRIGGER trigger_lock_on_quality_release
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_production_logs_on_quality_release();