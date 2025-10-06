-- Add cycle_time_seconds column to work_orders table
ALTER TABLE work_orders 
ADD COLUMN IF NOT EXISTS cycle_time_seconds numeric DEFAULT NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_work_orders_cycle_time ON work_orders(cycle_time_seconds);