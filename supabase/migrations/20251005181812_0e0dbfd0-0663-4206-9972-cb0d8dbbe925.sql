-- Create stage history table for full traceability
CREATE TABLE wo_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  from_stage wo_stage,
  to_stage wo_stage NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  reason text,
  is_override boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_wo_stage_history_wo_id ON wo_stage_history(wo_id);
CREATE INDEX idx_wo_stage_history_changed_at ON wo_stage_history(changed_at DESC);

-- Enable RLS
ALTER TABLE wo_stage_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view stage history"
  ON wo_stage_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create stage history"
  ON wo_stage_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Function to log stage changes and update current_stage
CREATE OR REPLACE FUNCTION log_wo_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert stage history record
  INSERT INTO wo_stage_history (wo_id, from_stage, to_stage, changed_by, is_override)
  VALUES (
    NEW.id,
    OLD.current_stage,
    NEW.current_stage,
    auth.uid(),
    COALESCE(NEW.current_stage != OLD.current_stage AND OLD.current_stage IS NOT NULL, false)
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger on work_orders for automatic stage history logging
CREATE TRIGGER log_wo_stage_change_trigger
AFTER UPDATE OF current_stage ON work_orders
FOR EACH ROW
WHEN (OLD.current_stage IS DISTINCT FROM NEW.current_stage)
EXECUTE FUNCTION log_wo_stage_change();

-- Backfill existing WOs with initial stage history
INSERT INTO wo_stage_history (wo_id, from_stage, to_stage, changed_at)
SELECT id, NULL, current_stage, created_at
FROM work_orders
WHERE current_stage IS NOT NULL
ON CONFLICT DO NOTHING;