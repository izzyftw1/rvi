-- Add missing role values to app_role enum if not present
DO $$
BEGIN
  -- Add 'logistics' role if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'logistics' AND enumtypid = 'app_role'::regtype) THEN
    ALTER TYPE app_role ADD VALUE 'logistics';
  END IF;
END $$;

-- Seed departments for common manufacturing operations
-- Only insert if they don't already exist
INSERT INTO public.departments (name, type, site_id)
SELECT 'CNC', 'production', (SELECT id FROM sites LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE name = 'CNC');

INSERT INTO public.departments (name, type, site_id)
SELECT 'Cutting', 'production', (SELECT id FROM sites LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE name = 'Cutting');

INSERT INTO public.departments (name, type, site_id)
SELECT 'Forging', 'production', (SELECT id FROM sites LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE name = 'Forging');

INSERT INTO public.departments (name, type, site_id)
SELECT 'Plating', 'production', (SELECT id FROM sites LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE name = 'Plating');

INSERT INTO public.departments (name, type, site_id)
SELECT 'Dispatch', 'transport', (SELECT id FROM sites LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE name = 'Dispatch');