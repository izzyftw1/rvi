-- Set a default value for wo_number so the trigger can populate it
-- This makes it optional in TypeScript Insert types while still being NOT NULL after trigger runs
ALTER TABLE work_orders ALTER COLUMN wo_number SET DEFAULT '';