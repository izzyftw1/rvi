-- Add stage tracking columns to production_batches
-- This promotes production_batches as the single source of truth for stage location and quantity

-- Create enum for stage types
DO $$ BEGIN
  CREATE TYPE batch_stage_type AS ENUM ('cutting', 'production', 'external', 'qc', 'packing', 'dispatched');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create enum for batch status
DO $$ BEGIN
  CREATE TYPE batch_status AS ENUM ('in_queue', 'in_progress', 'completed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add new columns to production_batches
ALTER TABLE public.production_batches
ADD COLUMN IF NOT EXISTS batch_quantity integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS stage_type batch_stage_type DEFAULT 'production',
ADD COLUMN IF NOT EXISTS external_process_type text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS batch_status batch_status DEFAULT 'in_queue',
ADD COLUMN IF NOT EXISTS stage_entered_at timestamp with time zone DEFAULT now(),
ADD COLUMN IF NOT EXISTS external_partner_id uuid REFERENCES external_partners(id) DEFAULT NULL;

-- Add index for efficient stage queries
CREATE INDEX IF NOT EXISTS idx_production_batches_stage ON production_batches(stage_type, batch_status);
CREATE INDEX IF NOT EXISTS idx_production_batches_wo_stage ON production_batches(wo_id, stage_type);

-- Comment for documentation
COMMENT ON COLUMN production_batches.stage_type IS 'Current stage: cutting, production, external, qc, packing, dispatched';
COMMENT ON COLUMN production_batches.external_process_type IS 'Process type when stage_type=external: forging, plating, blasting, etc';
COMMENT ON COLUMN production_batches.batch_status IS 'Status within the current stage: in_queue, in_progress, completed';
COMMENT ON COLUMN production_batches.batch_quantity IS 'Quantity in this batch at the current stage';
COMMENT ON COLUMN production_batches.stage_entered_at IS 'Timestamp when batch entered current stage';