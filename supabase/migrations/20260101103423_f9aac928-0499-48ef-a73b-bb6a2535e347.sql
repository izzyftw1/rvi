-- Remove 'draft' status and add procurement_type for raw material procurement workflow
-- Supporting both sales-linked and forward/overstock procurement

-- 1. First, update any existing 'draft' RPOs to 'pending_approval'
UPDATE raw_purchase_orders 
SET status = 'pending_approval' 
WHERE status = 'draft';

-- 2. Create new enum without 'draft' status
CREATE TYPE rpo_status_new AS ENUM (
  'pending_approval',
  'approved', 
  'part_received',
  'closed',
  'cancelled'
);

-- 3. Drop the default first, then alter type
ALTER TABLE raw_purchase_orders ALTER COLUMN status DROP DEFAULT;

-- 4. Alter the column to use the new enum
ALTER TABLE raw_purchase_orders 
  ALTER COLUMN status TYPE rpo_status_new 
  USING status::text::rpo_status_new;

-- 5. Set new default
ALTER TABLE raw_purchase_orders 
  ALTER COLUMN status SET DEFAULT 'pending_approval'::rpo_status_new;

-- 6. Drop old enum and rename new one
DROP TYPE rpo_status;
ALTER TYPE rpo_status_new RENAME TO rpo_status;

-- 7. Add procurement_type column to distinguish sales-linked vs overstock
ALTER TABLE raw_purchase_orders
  ADD COLUMN IF NOT EXISTS procurement_type TEXT NOT NULL DEFAULT 'sales_linked'
  CHECK (procurement_type IN ('sales_linked', 'overstock'));

-- 8. Add overstock_reason column for planning/overstock intent
ALTER TABLE raw_purchase_orders
  ADD COLUMN IF NOT EXISTS overstock_reason TEXT;

-- 9. Create trigger function to enforce material requirement linkage for sales-linked procurement
CREATE OR REPLACE FUNCTION validate_rpo_procurement_type()
RETURNS TRIGGER AS $$
BEGIN
  -- For sales-linked procurement, material_requirement_id is mandatory
  IF NEW.procurement_type = 'sales_linked' THEN
    IF NEW.material_requirement_id IS NULL AND NEW.wo_id IS NULL AND NEW.so_id IS NULL THEN
      RAISE EXCEPTION 'Sales-linked procurement must be linked to a Material Requirement, Work Order, or Sales Order';
    END IF;
  END IF;
  
  -- For overstock procurement, overstock_reason should be provided
  IF NEW.procurement_type = 'overstock' THEN
    IF NEW.overstock_reason IS NULL OR TRIM(NEW.overstock_reason) = '' THEN
      RAISE EXCEPTION 'Overstock procurement must have a reason/intent specified';
    END IF;
    -- Clear SO/WO/MR links for overstock to keep data clean
    NEW.so_id := NULL;
    NEW.wo_id := NULL;
    NEW.material_requirement_id := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Create trigger
DROP TRIGGER IF EXISTS trg_validate_rpo_procurement_type ON raw_purchase_orders;
CREATE TRIGGER trg_validate_rpo_procurement_type
  BEFORE INSERT OR UPDATE ON raw_purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION validate_rpo_procurement_type();

-- 11. Add index for efficient filtering by procurement_type
CREATE INDEX IF NOT EXISTS idx_rpo_procurement_type ON raw_purchase_orders(procurement_type);

-- 12. Update existing records: set procurement_type based on existing links
UPDATE raw_purchase_orders
SET procurement_type = CASE 
  WHEN so_id IS NOT NULL OR wo_id IS NOT NULL OR material_requirement_id IS NOT NULL 
  THEN 'sales_linked'
  ELSE 'overstock'
END;

-- 13. For any overstock ones that got set but don't have reason, add default
UPDATE raw_purchase_orders
SET overstock_reason = 'Legacy procurement - no reason provided'
WHERE procurement_type = 'overstock' AND (overstock_reason IS NULL OR overstock_reason = '');