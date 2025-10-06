-- Add operator_id column to machines table
ALTER TABLE machines 
ADD COLUMN IF NOT EXISTS operator_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Update machines status constraint to ensure all valid statuses are included
ALTER TABLE machines 
DROP CONSTRAINT IF EXISTS machines_status_check;

ALTER TABLE machines 
ADD CONSTRAINT machines_status_check 
CHECK (status IN ('idle', 'running', 'waiting_qc', 'down', 'maintenance', 'paused'));

-- Insert seed data for CNC machines 1-35 if they don't exist
INSERT INTO machines (machine_id, name, status, department_id)
SELECT 
  'CNC-' || LPAD(num::text, 2, '0'),
  'CNC Machine ' || num,
  'idle',
  (SELECT id FROM departments WHERE type = 'production' LIMIT 1)
FROM generate_series(1, 35) AS num
ON CONFLICT (machine_id) DO NOTHING;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_machines_operator_id ON machines(operator_id);
CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);