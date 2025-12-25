
-- STEP 0: Clean up existing duplicate QC records (keep oldest)
-- Delete duplicates for records where batch_id IS NULL
WITH duplicates AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY wo_id, qc_type ORDER BY created_at ASC, id ASC) as rn
  FROM public.qc_records
  WHERE batch_id IS NULL
)
DELETE FROM public.qc_records
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Clean up duplicates for records where batch_id IS NOT NULL
WITH duplicates AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY wo_id, batch_id, qc_type ORDER BY created_at ASC, id ASC) as rn
  FROM public.qc_records
  WHERE batch_id IS NOT NULL
)
DELETE FROM public.qc_records
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- STEP 1: Drop ALL duplicate QC auto-creation triggers
DROP TRIGGER IF EXISTS tr_auto_create_qc_incoming ON public.work_orders;
DROP TRIGGER IF EXISTS trigger_auto_qc_production ON public.work_orders;
DROP TRIGGER IF EXISTS trigger_auto_qc_material ON public.wo_material_issues;
DROP TRIGGER IF EXISTS trigger_auto_create_qc_for_wo ON public.work_orders;

-- Drop old functions to clean up
DROP FUNCTION IF EXISTS public.auto_create_qc_incoming() CASCADE;
DROP FUNCTION IF EXISTS public.auto_create_qc_gate() CASCADE;

-- STEP 2: Add unique constraint on (wo_id, batch_id, qc_type) to prevent duplicates
DROP INDEX IF EXISTS idx_qc_records_unique_wo_batch_type;
CREATE UNIQUE INDEX idx_qc_records_unique_wo_batch_type 
ON public.qc_records (wo_id, qc_type) 
WHERE batch_id IS NULL;

DROP INDEX IF EXISTS idx_qc_records_unique_wo_batch_type_with_batch;
CREATE UNIQUE INDEX idx_qc_records_unique_wo_batch_type_with_batch 
ON public.qc_records (wo_id, batch_id, qc_type) 
WHERE batch_id IS NOT NULL;

-- STEP 3: Create a single authoritative server-side qc_id generator
CREATE OR REPLACE FUNCTION public.generate_qc_id(qc_type_in qc_type)
RETURNS text AS $$
DECLARE
  prefix text;
  seq_num integer;
BEGIN
  -- Determine prefix based on QC type
  prefix := CASE qc_type_in
    WHEN 'incoming' THEN 'QC-INC'
    WHEN 'first_piece' THEN 'QC-FP'
    WHEN 'final' THEN 'QC-FINAL'
    WHEN 'post_external' THEN 'QC-EXT'
    ELSE 'QC-OTH'
  END;
  
  -- Atomically get next sequence number using advisory lock for safety
  PERFORM pg_advisory_xact_lock(hashtext('qc_id_generator'));
  
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(qc_id, '^' || prefix || '-', ''), '')::integer
  ), 0) + 1
  INTO seq_num
  FROM public.qc_records
  WHERE qc_id LIKE prefix || '-%';
  
  RETURN prefix || '-' || LPAD(seq_num::text, 6, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- STEP 4: Create trigger function to set qc_id server-side
CREATE OR REPLACE FUNCTION public.trigger_set_qc_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Always generate qc_id server-side to ensure uniqueness
  NEW.qc_id := generate_qc_id(NEW.qc_type);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for qc_id generation
DROP TRIGGER IF EXISTS set_qc_id_trigger ON public.qc_records;
CREATE TRIGGER set_qc_id_trigger
  BEFORE INSERT ON public.qc_records
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_qc_id();

-- STEP 5: Create single authoritative idempotent QC auto-creation function
CREATE OR REPLACE FUNCTION public.auto_create_qc_for_work_order()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create QC records on INSERT (new work order)
  -- Use ON CONFLICT to ensure idempotency
  
  -- Create Material QC (incoming) record
  INSERT INTO public.qc_records (wo_id, qc_type, result, remarks)
  VALUES (NEW.id, 'incoming', 'pending', 'Auto-generated Material QC gate')
  ON CONFLICT DO NOTHING;
  
  -- Create First Piece QC record
  INSERT INTO public.qc_records (wo_id, qc_type, result, remarks)
  VALUES (NEW.id, 'first_piece', 'pending', 'Auto-generated First Piece QC gate')
  ON CONFLICT DO NOTHING;
  
  -- Create Final QC record
  INSERT INTO public.qc_records (wo_id, qc_type, result, remarks)
  VALUES (NEW.id, 'final', 'pending', 'Auto-generated Final QC gate')
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- STEP 6: Create single AFTER INSERT trigger for QC auto-creation
CREATE TRIGGER trigger_auto_create_qc_for_wo
  AFTER INSERT ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_qc_for_work_order();

-- STEP 7: Add immutability trigger for qc_id
CREATE OR REPLACE FUNCTION public.prevent_qc_id_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.qc_id IS NOT NULL AND NEW.qc_id IS DISTINCT FROM OLD.qc_id THEN
    RAISE EXCEPTION 'qc_id is immutable and cannot be changed after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS prevent_qc_id_change_trigger ON public.qc_records;
CREATE TRIGGER prevent_qc_id_change_trigger
  BEFORE UPDATE ON public.qc_records
  FOR EACH ROW
  EXECUTE FUNCTION prevent_qc_id_change();
