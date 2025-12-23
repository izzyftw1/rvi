-- Step 1: Create function to generate WO number in format WO-YYYY-XXXXX
CREATE OR REPLACE FUNCTION public.generate_wo_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_year TEXT;
  next_sequence INTEGER;
BEGIN
  current_year := TO_CHAR(CURRENT_DATE, 'YYYY');
  
  -- Get the next sequence number for this year
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(wo_number FROM 'WO-' || current_year || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO next_sequence
  FROM work_orders
  WHERE wo_number LIKE 'WO-' || current_year || '-%';
  
  RETURN 'WO-' || current_year || '-' || LPAD(next_sequence::TEXT, 5, '0');
END;
$$;

-- Step 2: Create trigger function to auto-generate wo_number on insert
CREATE OR REPLACE FUNCTION public.auto_generate_wo_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only generate if wo_number is null or empty
  IF NEW.wo_number IS NULL OR NEW.wo_number = '' THEN
    NEW.wo_number := generate_wo_number();
  END IF;
  
  -- Also set display_id to match wo_number for consistency
  IF NEW.display_id IS NULL OR NEW.display_id = '' THEN
    NEW.display_id := NEW.wo_number;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Step 3: Create trigger (drop if exists first)
DROP TRIGGER IF EXISTS trigger_auto_generate_wo_number ON work_orders;

CREATE TRIGGER trigger_auto_generate_wo_number
BEFORE INSERT ON work_orders
FOR EACH ROW
EXECUTE FUNCTION auto_generate_wo_number();

-- Step 4: Migrate existing work orders to new format
-- This updates all existing wo_numbers to the new format WO-YYYY-XXXXX
WITH numbered_wos AS (
  SELECT 
    id,
    TO_CHAR(created_at, 'YYYY') as year,
    ROW_NUMBER() OVER (PARTITION BY TO_CHAR(created_at, 'YYYY') ORDER BY created_at) as seq
  FROM work_orders
  WHERE wo_number IS NULL 
     OR wo_number NOT LIKE 'WO-____-_____'
)
UPDATE work_orders wo
SET 
  wo_number = 'WO-' || n.year || '-' || LPAD(n.seq::TEXT, 5, '0'),
  display_id = 'WO-' || n.year || '-' || LPAD(n.seq::TEXT, 5, '0')
FROM numbered_wos n
WHERE wo.id = n.id;

-- Step 5: Make wo_number NOT NULL after migration
ALTER TABLE work_orders 
ALTER COLUMN wo_number SET NOT NULL;

-- Step 6: Add unique constraint on wo_number
ALTER TABLE work_orders 
ADD CONSTRAINT work_orders_wo_number_unique UNIQUE (wo_number);

-- Step 7: Add check constraint for format validation
ALTER TABLE work_orders 
ADD CONSTRAINT work_orders_wo_number_format_check 
CHECK (wo_number ~ '^WO-[0-9]{4}-[0-9]{5}$');

-- Step 8: Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_work_orders_wo_number ON work_orders(wo_number);