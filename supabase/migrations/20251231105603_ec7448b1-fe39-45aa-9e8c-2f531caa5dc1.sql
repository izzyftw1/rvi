
-- STEP 1: Delete orphan department_defaults for types being removed
DELETE FROM department_defaults 
WHERE department_type IN ('stores', 'she', 'transport', 'purchase', 'accounts', 'inventory', 'quality_systems', 'maintenance', 'supplier');

-- STEP 2: Update any users in departments being removed to a valid department
-- First, get department IDs for valid types to reassign
UPDATE profiles 
SET department_id = (SELECT id FROM departments WHERE type = 'production' LIMIT 1)
WHERE department_id IN (
  SELECT id FROM departments 
  WHERE type IN ('stores', 'she', 'transport', 'purchase', 'accounts', 'inventory', 'quality_systems', 'maintenance')
);

-- STEP 3: Delete supplier_users table entries (we're removing supplier department)
DELETE FROM supplier_users;

-- STEP 4: Delete departments that shouldn't exist
DELETE FROM departments 
WHERE type IN ('stores', 'she', 'transport', 'purchase', 'accounts', 'inventory', 'quality_systems', 'maintenance');

-- STEP 5: Create the new enum type with only 8 values
CREATE TYPE department_type_new AS ENUM (
  'admin',
  'finance', 
  'sales',
  'design',
  'hr',
  'production',
  'quality',
  'packing'
);

-- STEP 6: Update departments table to use new enum
ALTER TABLE departments 
  ALTER COLUMN type TYPE department_type_new 
  USING type::text::department_type_new;

-- STEP 7: Drop old enum and rename new one
DROP TYPE department_type;
ALTER TYPE department_type_new RENAME TO department_type;

-- STEP 8: Ensure we have exactly one department per type
INSERT INTO departments (name, type, description)
SELECT 'Admin', 'admin', 'Administration department'
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE type = 'admin');

INSERT INTO departments (name, type, description)
SELECT 'Finance', 'finance', 'Finance department'
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE type = 'finance');

INSERT INTO departments (name, type, description)
SELECT 'Sales', 'sales', 'Sales department'
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE type = 'sales');

INSERT INTO departments (name, type, description)
SELECT 'Design', 'design', 'Design department'
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE type = 'design');

INSERT INTO departments (name, type, description)
SELECT 'HR', 'hr', 'Human Resources department'
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE type = 'hr');

INSERT INTO departments (name, type, description)
SELECT 'Production', 'production', 'Production department'
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE type = 'production');

INSERT INTO departments (name, type, description)
SELECT 'QC', 'quality', 'Quality Control department'
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE type = 'quality');

INSERT INTO departments (name, type, description)
SELECT 'Packing', 'packing', 'Packing department'
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE type = 'packing');

-- STEP 9: Remove duplicate production departments (keep only one)
DELETE FROM departments 
WHERE type = 'production' 
AND id NOT IN (SELECT id FROM departments WHERE type = 'production' ORDER BY created_at LIMIT 1);

-- STEP 10: Clear and repopulate department_defaults for all 8 departments
DELETE FROM department_defaults;

-- Define all page keys
DO $$
DECLARE
  page_keys TEXT[] := ARRAY[
    'work-orders', 'work-order-detail', 'sales', 'customer-master', 'item-master',
    'goods-inwards', 'material-inwards', 'qc-incoming', 'cutting', 'forging',
    'daily-production-log', 'hourly-qc', 'cnc-dashboard', 'machine-status',
    'final-qc', 'packing', 'dispatch', 'gate-register', 'external-analytics',
    'floor-dashboard', 'production-progress', 'quality-analytics', 'quality-traceability',
    'ncr-management', 'operator-efficiency', 'setter-efficiency', 'machine-utilisation',
    'downtime-analytics', 'inventory-control', 'material-requirements', 'procurement-dashboard',
    'raw-purchase-orders', 'finished-goods', 'logistics', 'partners', 'finance-dashboard',
    'invoices', 'payments', 'aging', 'reports', 'admin', 'factory-calendar',
    'gantt-scheduler', 'genealogy', 'tolerance-setup', 'instrument-management'
  ];
  dept_type TEXT;
  page_key TEXT;
  can_view BOOLEAN;
  can_mutate BOOLEAN;
  can_route BOOLEAN;
BEGIN
  -- ADMIN: Full access to everything
  FOREACH page_key IN ARRAY page_keys LOOP
    INSERT INTO department_defaults (department_type, page_key, can_view, can_mutate, can_access_route)
    VALUES ('admin', page_key, true, true, true);
  END LOOP;

  -- FINANCE: Full access to everything
  FOREACH page_key IN ARRAY page_keys LOOP
    INSERT INTO department_defaults (department_type, page_key, can_view, can_mutate, can_access_route)
    VALUES ('finance', page_key, true, true, true);
  END LOOP;

  -- SALES: Sales, customers, items, work orders (view), reports
  FOREACH page_key IN ARRAY page_keys LOOP
    can_view := page_key IN ('sales', 'customer-master', 'item-master', 'work-orders', 'work-order-detail', 'reports', 'floor-dashboard');
    can_mutate := page_key IN ('sales', 'customer-master', 'item-master');
    can_route := can_view;
    INSERT INTO department_defaults (department_type, page_key, can_view, can_mutate, can_access_route)
    VALUES ('sales', page_key, can_view, can_mutate, can_route);
  END LOOP;

  -- DESIGN: Work orders, tolerance setup, design files
  FOREACH page_key IN ARRAY page_keys LOOP
    can_view := page_key IN ('work-orders', 'work-order-detail', 'tolerance-setup', 'item-master');
    can_mutate := page_key IN ('tolerance-setup');
    can_route := can_view;
    INSERT INTO department_defaults (department_type, page_key, can_view, can_mutate, can_access_route)
    VALUES ('design', page_key, can_view, can_mutate, can_route);
  END LOOP;

  -- HR: Efficiency reports, operator management
  FOREACH page_key IN ARRAY page_keys LOOP
    can_view := page_key IN ('operator-efficiency', 'setter-efficiency', 'reports', 'floor-dashboard');
    can_mutate := false;
    can_route := can_view;
    INSERT INTO department_defaults (department_type, page_key, can_view, can_mutate, can_access_route)
    VALUES ('hr', page_key, can_view, can_mutate, can_route);
  END LOOP;

  -- PRODUCTION: Full production access
  FOREACH page_key IN ARRAY page_keys LOOP
    can_view := page_key IN (
      'work-orders', 'work-order-detail', 'goods-inwards', 'material-inwards', 
      'cutting', 'forging', 'daily-production-log', 'cnc-dashboard', 'machine-status',
      'floor-dashboard', 'production-progress', 'operator-efficiency', 'setter-efficiency',
      'machine-utilisation', 'downtime-analytics', 'gantt-scheduler', 'external-analytics',
      'partners', 'gate-register'
    );
    can_mutate := page_key IN (
      'goods-inwards', 'material-inwards', 'cutting', 'forging', 
      'daily-production-log', 'machine-status', 'gate-register'
    );
    can_route := can_view;
    INSERT INTO department_defaults (department_type, page_key, can_view, can_mutate, can_access_route)
    VALUES ('production', page_key, can_view, can_mutate, can_route);
  END LOOP;

  -- QC: Quality control pages
  FOREACH page_key IN ARRAY page_keys LOOP
    can_view := page_key IN (
      'work-orders', 'work-order-detail', 'qc-incoming', 'hourly-qc', 'final-qc',
      'quality-analytics', 'quality-traceability', 'ncr-management', 'instrument-management',
      'tolerance-setup', 'floor-dashboard', 'reports'
    );
    can_mutate := page_key IN (
      'qc-incoming', 'hourly-qc', 'final-qc', 'ncr-management', 'instrument-management'
    );
    can_route := can_view;
    INSERT INTO department_defaults (department_type, page_key, can_view, can_mutate, can_access_route)
    VALUES ('quality', page_key, can_view, can_mutate, can_route);
  END LOOP;

  -- PACKING: Packing and dispatch
  FOREACH page_key IN ARRAY page_keys LOOP
    can_view := page_key IN (
      'work-orders', 'work-order-detail', 'packing', 'dispatch', 'logistics',
      'gate-register', 'floor-dashboard', 'finished-goods'
    );
    can_mutate := page_key IN ('packing', 'dispatch', 'gate-register');
    can_route := can_view;
    INSERT INTO department_defaults (department_type, page_key, can_view, can_mutate, can_access_route)
    VALUES ('packing', page_key, can_view, can_mutate, can_route);
  END LOOP;
END $$;
