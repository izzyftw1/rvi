-- Update existing machines to CNC naming convention
-- First, update any existing machines
WITH numbered_machines AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM public.machines
)
UPDATE public.machines m
SET 
  machine_id = 'CNC-' || nm.rn,
  name = 'CNC ' || nm.rn,
  status = 'available'
FROM numbered_machines nm
WHERE m.id = nm.id;

-- Then insert additional machines if we have fewer than 50
INSERT INTO public.machines (machine_id, name, status)
SELECT 
  'CNC-' || num,
  'CNC ' || num,
  'available'
FROM generate_series(
  (SELECT COALESCE(MAX(CAST(SUBSTRING(machine_id FROM 5) AS INTEGER)), 0) + 1 FROM public.machines WHERE machine_id LIKE 'CNC-%'),
  50
) AS num
WHERE num <= 50
ON CONFLICT DO NOTHING;