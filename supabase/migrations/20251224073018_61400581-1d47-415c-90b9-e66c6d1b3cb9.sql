-- Create enum for location types
CREATE TYPE public.batch_location_type AS ENUM (
  'factory',
  'external_partner', 
  'transit',
  'packed',
  'dispatched'
);

-- Create enum for batch unit
CREATE TYPE public.batch_unit AS ENUM (
  'pcs',
  'kg'
);

-- Add new columns to production_batches for comprehensive tracking
ALTER TABLE public.production_batches
ADD COLUMN IF NOT EXISTS current_location_type public.batch_location_type DEFAULT 'factory',
ADD COLUMN IF NOT EXISTS current_location_ref uuid DEFAULT NULL,
ADD COLUMN IF NOT EXISTS current_process text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS unit public.batch_unit DEFAULT 'pcs';

-- Add comments for documentation
COMMENT ON COLUMN public.production_batches.current_location_type IS 'Where the batch physically is: factory, external_partner, transit, packed, dispatched';
COMMENT ON COLUMN public.production_batches.current_location_ref IS 'Reference ID: department_id, partner_id, or shipment_id based on location_type';
COMMENT ON COLUMN public.production_batches.current_process IS 'Current process the batch is undergoing: cutting, forging, plating, production, qc, etc.';
COMMENT ON COLUMN public.production_batches.unit IS 'Unit of measurement for batch quantity';

-- Create index for efficient querying by location
CREATE INDEX IF NOT EXISTS idx_production_batches_location 
ON public.production_batches(current_location_type, current_location_ref);

-- Create index for querying by process
CREATE INDEX IF NOT EXISTS idx_production_batches_process 
ON public.production_batches(current_process);

-- Migrate existing data to populate new columns based on current stage_type
UPDATE public.production_batches
SET 
  current_location_type = CASE 
    WHEN stage_type = 'external' THEN 'external_partner'::batch_location_type
    WHEN stage_type = 'dispatched' THEN 'dispatched'::batch_location_type
    WHEN stage_type = 'packing' THEN 'packed'::batch_location_type
    ELSE 'factory'::batch_location_type
  END,
  current_location_ref = CASE 
    WHEN stage_type = 'external' THEN external_partner_id
    ELSE NULL
  END,
  current_process = CASE 
    WHEN stage_type = 'external' THEN external_process_type
    WHEN stage_type = 'cutting' THEN 'cutting'
    WHEN stage_type = 'production' THEN 'production'
    WHEN stage_type = 'qc' THEN 'qc'
    WHEN stage_type = 'packing' THEN 'packing'
    WHEN stage_type = 'dispatched' THEN 'dispatched'
    ELSE stage_type::text
  END
WHERE current_location_type IS NULL OR current_process IS NULL;