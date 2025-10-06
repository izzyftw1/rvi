-- Standardize CNC machine naming to use zero-padded format (CNC-01, CNC-02, etc.)
-- This fixes sorting issues caused by mixing CNC-1 and CNC-01 formats

-- First, update all references in related tables to point to the zero-padded versions

-- Update hourly_qc_checks references
UPDATE hourly_qc_checks 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-01' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-1'
);

UPDATE hourly_qc_checks 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-02' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-2'
);

UPDATE hourly_qc_checks 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-03' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-3'
);

UPDATE hourly_qc_checks 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-04' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-4'
);

UPDATE hourly_qc_checks 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-05' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-5'
);

UPDATE hourly_qc_checks 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-06' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-6'
);

UPDATE hourly_qc_checks 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-07' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-7'
);

UPDATE hourly_qc_checks 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-08' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-8'
);

UPDATE hourly_qc_checks 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-09' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-9'
);

-- Update wo_machine_assignments references
UPDATE wo_machine_assignments 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-01' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-1'
);

UPDATE wo_machine_assignments 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-02' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-2'
);

UPDATE wo_machine_assignments 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-03' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-3'
);

UPDATE wo_machine_assignments 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-04' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-4'
);

UPDATE wo_machine_assignments 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-05' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-5'
);

UPDATE wo_machine_assignments 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-06' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-6'
);

UPDATE wo_machine_assignments 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-07' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-7'
);

UPDATE wo_machine_assignments 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-08' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-8'
);

UPDATE wo_machine_assignments 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-09' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-9'
);

-- Update maintenance_logs references
UPDATE maintenance_logs 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-01' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-1'
);

UPDATE maintenance_logs 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-02' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-2'
);

UPDATE maintenance_logs 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-03' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-3'
);

UPDATE maintenance_logs 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-04' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-4'
);

UPDATE maintenance_logs 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-05' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-5'
);

UPDATE maintenance_logs 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-06' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-6'
);

UPDATE maintenance_logs 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-07' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-7'
);

UPDATE maintenance_logs 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-08' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-8'
);

UPDATE maintenance_logs 
SET machine_id = (
  SELECT id FROM machines WHERE machine_id = 'CNC-09' LIMIT 1
)
WHERE machine_id IN (
  SELECT id FROM machines WHERE machine_id = 'CNC-9'
);

-- Update work_orders current_wo_id references  
UPDATE work_orders 
SET current_stage = current_stage
WHERE id IN (
  SELECT current_wo_id FROM machines WHERE machine_id IN ('CNC-1', 'CNC-2', 'CNC-3', 'CNC-4', 'CNC-5', 'CNC-6', 'CNC-7', 'CNC-8', 'CNC-9')
);

-- Now delete the duplicate non-padded machines
DELETE FROM machines WHERE machine_id IN ('CNC-1', 'CNC-2', 'CNC-3', 'CNC-4', 'CNC-5', 'CNC-6', 'CNC-7', 'CNC-8', 'CNC-9');

-- Ensure all remaining machines have consistent naming
UPDATE machines SET name = 'CNC Machine 10' WHERE machine_id = 'CNC-10';
UPDATE machines SET name = 'CNC Machine 11' WHERE machine_id = 'CNC-11';
UPDATE machines SET name = 'CNC Machine 12' WHERE machine_id = 'CNC-12';
UPDATE machines SET name = 'CNC Machine 13' WHERE machine_id = 'CNC-13';
UPDATE machines SET name = 'CNC Machine 14' WHERE machine_id = 'CNC-14';
UPDATE machines SET name = 'CNC Machine 15' WHERE machine_id = 'CNC-15';
UPDATE machines SET name = 'CNC Machine 16' WHERE machine_id = 'CNC-16';
UPDATE machines SET name = 'CNC Machine 17' WHERE machine_id = 'CNC-17';
UPDATE machines SET name = 'CNC Machine 18' WHERE machine_id = 'CNC-18';
UPDATE machines SET name = 'CNC Machine 19' WHERE machine_id = 'CNC-19';
UPDATE machines SET name = 'CNC Machine 20' WHERE machine_id = 'CNC-20';
UPDATE machines SET name = 'CNC Machine 21' WHERE machine_id = 'CNC-21';
UPDATE machines SET name = 'CNC Machine 22' WHERE machine_id = 'CNC-22';
UPDATE machines SET name = 'CNC Machine 23' WHERE machine_id = 'CNC-23';
UPDATE machines SET name = 'CNC Machine 24' WHERE machine_id = 'CNC-24';
UPDATE machines SET name = 'CNC Machine 25' WHERE machine_id = 'CNC-25';
UPDATE machines SET name = 'CNC Machine 26' WHERE machine_id = 'CNC-26';
UPDATE machines SET name = 'CNC Machine 27' WHERE machine_id = 'CNC-27';
UPDATE machines SET name = 'CNC Machine 28' WHERE machine_id = 'CNC-28';
UPDATE machines SET name = 'CNC Machine 29' WHERE machine_id = 'CNC-29';
UPDATE machines SET name = 'CNC Machine 30' WHERE machine_id = 'CNC-30';
UPDATE machines SET name = 'CNC Machine 31' WHERE machine_id = 'CNC-31';
UPDATE machines SET name = 'CNC Machine 32' WHERE machine_id = 'CNC-32';
UPDATE machines SET name = 'CNC Machine 33' WHERE machine_id = 'CNC-33';
UPDATE machines SET name = 'CNC Machine 34' WHERE machine_id = 'CNC-34';
UPDATE machines SET name = 'CNC Machine 35' WHERE machine_id = 'CNC-35';
UPDATE machines SET name = 'CNC Machine 36' WHERE machine_id = 'CNC-36';
UPDATE machines SET name = 'CNC Machine 37' WHERE machine_id = 'CNC-37';
UPDATE machines SET name = 'CNC Machine 38' WHERE machine_id = 'CNC-38';
UPDATE machines SET name = 'CNC Machine 39' WHERE machine_id = 'CNC-39';
UPDATE machines SET name = 'CNC Machine 40' WHERE machine_id = 'CNC-40';
UPDATE machines SET name = 'CNC Machine 41' WHERE machine_id = 'CNC-41';
UPDATE machines SET name = 'CNC Machine 42' WHERE machine_id = 'CNC-42';
UPDATE machines SET name = 'CNC Machine 43' WHERE machine_id = 'CNC-43';
UPDATE machines SET name = 'CNC Machine 44' WHERE machine_id = 'CNC-44';
UPDATE machines SET name = 'CNC Machine 45' WHERE machine_id = 'CNC-45';
UPDATE machines SET name = 'CNC Machine 46' WHERE machine_id = 'CNC-46';
UPDATE machines SET name = 'CNC Machine 47' WHERE machine_id = 'CNC-47';
UPDATE machines SET name = 'CNC Machine 48' WHERE machine_id = 'CNC-48';
UPDATE machines SET name = 'CNC Machine 49' WHERE machine_id = 'CNC-49';
UPDATE machines SET name = 'CNC Machine 50' WHERE machine_id = 'CNC-50';