-- =====================================================
-- DEPARTMENT-LEVEL DEFAULT PERMISSIONS SYSTEM
-- Excel file is SINGLE SOURCE OF TRUTH
-- Admin & Finance bypass all checks
-- =====================================================

-- 1. Create department_defaults table for page-level permissions
CREATE TABLE IF NOT EXISTS public.department_defaults (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    department_type text NOT NULL,
    page_key text NOT NULL,
    can_view boolean NOT NULL DEFAULT false,
    can_access_route boolean NOT NULL DEFAULT false,
    can_mutate boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(department_type, page_key)
);

-- Enable RLS
ALTER TABLE public.department_defaults ENABLE ROW LEVEL SECURITY;

-- Everyone can view department defaults (needed for navigation/routing)
CREATE POLICY "Everyone can view department_defaults"
ON public.department_defaults FOR SELECT
USING (true);

-- Only admins can manage department defaults
CREATE POLICY "Admins can manage department_defaults"
ON public.department_defaults FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. Create helper function to check page access by department type
CREATE OR REPLACE FUNCTION public.can_access_page(
    _user_id uuid,
    _page_key text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _has_access boolean := false;
    _is_admin_or_finance boolean := false;
    _user_dept_type text;
BEGIN
    -- Admin and Finance always have full access
    IF has_role(_user_id, 'admin'::app_role) OR 
       has_role(_user_id, 'super_admin'::app_role) OR
       has_role(_user_id, 'finance_admin'::app_role) OR
       has_role(_user_id, 'accounts'::app_role) THEN
        RETURN true;
    END IF;
    
    -- Get user's department type from profiles
    SELECT d.type INTO _user_dept_type
    FROM profiles p
    JOIN departments d ON d.id = p.department_id
    WHERE p.id = _user_id;
    
    IF _user_dept_type IS NULL THEN
        -- No department assigned, deny access (except for default pages)
        RETURN false;
    END IF;
    
    -- Check department_defaults for access
    SELECT can_access_route INTO _has_access
    FROM department_defaults
    WHERE department_type = _user_dept_type
      AND page_key = _page_key;
    
    RETURN COALESCE(_has_access, false);
END;
$$;

-- 3. Populate department_defaults from Excel data
-- Department types mapped from existing departments:
-- Admin -> admin (full access, bypass)
-- Finance -> accounts (full access, bypass)  
-- Sales -> sales
-- Design -> design
-- HR -> hr
-- Production -> production
-- QC -> quality
-- Packaging -> packing

-- Clear existing data first (for re-runs)
DELETE FROM department_defaults WHERE 1=1;

-- Sales & Customers section
INSERT INTO department_defaults (department_type, page_key, can_view, can_access_route, can_mutate) VALUES
-- Sales Orders: Admin, Finance, Sales
('sales', 'sales-orders', true, true, true),
('production', 'sales-orders', false, false, false),
('quality', 'sales-orders', false, false, false),
('packing', 'sales-orders', false, false, false),
('design', 'sales-orders', false, false, false),
('hr', 'sales-orders', false, false, false),
-- Customers: Admin, Finance, Sales
('sales', 'customers', true, true, true),
('production', 'customers', false, false, false),
('quality', 'customers', false, false, false),
('packing', 'customers', false, false, false),
('design', 'customers', false, false, false),
('hr', 'customers', false, false, false),
-- Items: Admin, Finance, Sales, Design, Production, QC, Packaging
('sales', 'items', true, true, true),
('design', 'items', true, true, false),
('production', 'items', true, true, false),
('quality', 'items', true, true, false),
('packing', 'items', true, true, false),
('hr', 'items', false, false, false);

-- Procurement section (Admin, Finance only)
INSERT INTO department_defaults (department_type, page_key, can_view, can_access_route, can_mutate) VALUES
('sales', 'raw-po', false, false, false),
('design', 'raw-po', false, false, false),
('production', 'raw-po', false, false, false),
('quality', 'raw-po', false, false, false),
('packing', 'raw-po', false, false, false),
('hr', 'raw-po', false, false, false),
('purchase', 'raw-po', true, true, true),
('stores', 'raw-po', true, true, false),
-- Material Requirements
('sales', 'material-requirements', false, false, false),
('design', 'material-requirements', false, false, false),
('production', 'material-requirements', false, false, false),
('quality', 'material-requirements', false, false, false),
('packing', 'material-requirements', false, false, false),
('hr', 'material-requirements', false, false, false),
('purchase', 'material-requirements', true, true, true),
('stores', 'material-requirements', true, true, false),
-- Purchase Dashboard
('sales', 'purchase-dashboard', false, false, false),
('design', 'purchase-dashboard', false, false, false),
('production', 'purchase-dashboard', false, false, false),
('quality', 'purchase-dashboard', false, false, false),
('packing', 'purchase-dashboard', false, false, false),
('hr', 'purchase-dashboard', false, false, false),
('purchase', 'purchase-dashboard', true, true, false),
('stores', 'purchase-dashboard', true, true, false);

-- Production section
INSERT INTO department_defaults (department_type, page_key, can_view, can_access_route, can_mutate) VALUES
-- Work Orders: Admin, Finance, Sales, Design, Production, QC
('sales', 'work-orders', true, true, false),
('design', 'work-orders', true, true, false),
('production', 'work-orders', true, true, true),
('quality', 'work-orders', true, true, false),
('packing', 'work-orders', false, false, false),
('hr', 'work-orders', false, false, false),
-- Daily Production Log: Admin, Finance, Production, QC
('sales', 'daily-production-log', false, false, false),
('design', 'daily-production-log', false, false, false),
('production', 'daily-production-log', true, true, true),
('quality', 'daily-production-log', true, true, false),
('packing', 'daily-production-log', false, false, false),
('hr', 'daily-production-log', false, false, false),
-- Floor Dashboard: Admin, Finance, Production, QC
('sales', 'floor-dashboard', false, false, false),
('design', 'floor-dashboard', false, false, false),
('production', 'floor-dashboard', true, true, false),
('quality', 'floor-dashboard', true, true, false),
('packing', 'floor-dashboard', false, false, false),
('hr', 'floor-dashboard', false, false, false),
-- CNC Dashboard: Admin, Finance, Production, QC
('sales', 'cnc-dashboard', false, false, false),
('design', 'cnc-dashboard', false, false, false),
('production', 'cnc-dashboard', true, true, false),
('quality', 'cnc-dashboard', true, true, false),
('packing', 'cnc-dashboard', false, false, false),
('hr', 'cnc-dashboard', false, false, false),
-- Production Progress: Admin, Finance, Production, QC
('sales', 'production-progress', false, false, false),
('design', 'production-progress', false, false, false),
('production', 'production-progress', true, true, false),
('quality', 'production-progress', true, true, false),
('packing', 'production-progress', false, false, false),
('hr', 'production-progress', false, false, false),
-- Machine Utilisation: Admin, Finance, Production, QC
('sales', 'machine-utilisation', false, false, false),
('design', 'machine-utilisation', false, false, false),
('production', 'machine-utilisation', true, true, false),
('quality', 'machine-utilisation', true, true, false),
('packing', 'machine-utilisation', false, false, false),
('hr', 'machine-utilisation', false, false, false),
-- Operator Efficiency: Admin, Finance, HR, Production, QC
('sales', 'operator-efficiency', false, false, false),
('design', 'operator-efficiency', false, false, false),
('production', 'operator-efficiency', true, true, false),
('quality', 'operator-efficiency', true, true, false),
('packing', 'operator-efficiency', false, false, false),
('hr', 'operator-efficiency', true, true, false),
-- Setter Efficiency: Admin, Finance, HR, Production, QC
('sales', 'setter-efficiency', false, false, false),
('design', 'setter-efficiency', false, false, false),
('production', 'setter-efficiency', true, true, false),
('quality', 'setter-efficiency', true, true, false),
('packing', 'setter-efficiency', false, false, false),
('hr', 'setter-efficiency', true, true, false),
-- Downtime Analytics: Admin, Finance, Production, QC
('sales', 'downtime-analytics', false, false, false),
('design', 'downtime-analytics', false, false, false),
('production', 'downtime-analytics', true, true, false),
('quality', 'downtime-analytics', true, true, false),
('packing', 'downtime-analytics', false, false, false),
('hr', 'downtime-analytics', false, false, false);

-- Quality section
INSERT INTO department_defaults (department_type, page_key, can_view, can_access_route, can_mutate) VALUES
-- Quality Dashboard: Admin, Finance, QC
('sales', 'quality-dashboard', false, false, false),
('design', 'quality-dashboard', false, false, false),
('production', 'quality-dashboard', false, false, false),
('quality', 'quality-dashboard', true, true, false),
('packing', 'quality-dashboard', false, false, false),
('hr', 'quality-dashboard', false, false, false),
-- Incoming QC: Admin, Finance, QC
('sales', 'qc-incoming', false, false, false),
('design', 'qc-incoming', false, false, false),
('production', 'qc-incoming', false, false, false),
('quality', 'qc-incoming', true, true, true),
('packing', 'qc-incoming', false, false, false),
('hr', 'qc-incoming', false, false, false),
-- Hourly QC: Admin, Finance, QC
('sales', 'hourly-qc', false, false, false),
('design', 'hourly-qc', false, false, false),
('production', 'hourly-qc', false, false, false),
('quality', 'hourly-qc', true, true, true),
('packing', 'hourly-qc', false, false, false),
('hr', 'hourly-qc', false, false, false),
-- Final QC: Admin, Finance, QC
('sales', 'final-qc', false, false, false),
('design', 'final-qc', false, false, false),
('production', 'final-qc', false, false, false),
('quality', 'final-qc', true, true, true),
('packing', 'final-qc', false, false, false),
('hr', 'final-qc', false, false, false),
-- NCR Management: Admin, Finance, Sales, Production, QC
('sales', 'ncr', true, true, false),
('design', 'ncr', false, false, false),
('production', 'ncr', true, true, true),
('quality', 'ncr', true, true, true),
('packing', 'ncr', false, false, false),
('hr', 'ncr', false, false, false),
-- Traceability: Admin, Finance, Production, QC
('sales', 'traceability', false, false, false),
('design', 'traceability', false, false, false),
('production', 'traceability', true, true, false),
('quality', 'traceability', true, true, false),
('packing', 'traceability', false, false, false),
('hr', 'traceability', false, false, false),
-- Quality Documents: Admin, Finance, Sales, QC
('sales', 'quality-documents', true, true, false),
('design', 'quality-documents', false, false, false),
('production', 'quality-documents', false, false, false),
('quality', 'quality-documents', true, true, true),
('packing', 'quality-documents', false, false, false),
('hr', 'quality-documents', false, false, false),
-- Quality Analytics: Admin, Finance, QC
('sales', 'quality-analytics', false, false, false),
('design', 'quality-analytics', false, false, false),
('production', 'quality-analytics', false, false, false),
('quality', 'quality-analytics', true, true, false),
('packing', 'quality-analytics', false, false, false),
('hr', 'quality-analytics', false, false, false),
-- Tolerances: Admin, Finance, Design, Production, QC
('sales', 'tolerances', false, false, false),
('design', 'tolerances', true, true, true),
('production', 'tolerances', true, true, false),
('quality', 'tolerances', true, true, true),
('packing', 'tolerances', false, false, false),
('hr', 'tolerances', false, false, false),
-- Instruments: Admin, Finance, Production, QC
('sales', 'instruments', false, false, false),
('design', 'instruments', false, false, false),
('production', 'instruments', true, true, false),
('quality', 'instruments', true, true, true),
('packing', 'instruments', false, false, false),
('hr', 'instruments', false, false, false);

-- Finance section (Admin, Finance only - all others false)
INSERT INTO department_defaults (department_type, page_key, can_view, can_access_route, can_mutate) VALUES
('sales', 'finance-dashboard', false, false, false),
('design', 'finance-dashboard', false, false, false),
('production', 'finance-dashboard', false, false, false),
('quality', 'finance-dashboard', false, false, false),
('packing', 'finance-dashboard', false, false, false),
('hr', 'finance-dashboard', false, false, false),
('sales', 'invoices', false, false, false),
('design', 'invoices', false, false, false),
('production', 'invoices', false, false, false),
('quality', 'invoices', false, false, false),
('packing', 'invoices', false, false, false),
('hr', 'invoices', false, false, false),
('sales', 'receipts', false, false, false),
('design', 'receipts', false, false, false),
('production', 'receipts', false, false, false),
('quality', 'receipts', false, false, false),
('packing', 'receipts', false, false, false),
('hr', 'receipts', false, false, false),
('sales', 'supplier-payments', false, false, false),
('design', 'supplier-payments', false, false, false),
('production', 'supplier-payments', false, false, false),
('quality', 'supplier-payments', false, false, false),
('packing', 'supplier-payments', false, false, false),
('hr', 'supplier-payments', false, false, false),
('sales', 'adjustments', false, false, false),
('design', 'adjustments', false, false, false),
('production', 'adjustments', false, false, false),
('quality', 'adjustments', false, false, false),
('packing', 'adjustments', false, false, false),
('hr', 'adjustments', false, false, false),
('sales', 'tds-report', false, false, false),
('design', 'tds-report', false, false, false),
('production', 'tds-report', false, false, false),
('quality', 'tds-report', false, false, false),
('packing', 'tds-report', false, false, false),
('hr', 'tds-report', false, false, false),
('sales', 'aging', false, false, false),
('design', 'aging', false, false, false),
('production', 'aging', false, false, false),
('quality', 'aging', false, false, false),
('packing', 'aging', false, false, false),
('hr', 'aging', false, false, false),
('sales', 'reconciliations', false, false, false),
('design', 'reconciliations', false, false, false),
('production', 'reconciliations', false, false, false),
('quality', 'reconciliations', false, false, false),
('packing', 'reconciliations', false, false, false),
('hr', 'reconciliations', false, false, false),
('sales', 'finance-reports', false, false, false),
('design', 'finance-reports', false, false, false),
('production', 'finance-reports', false, false, false),
('quality', 'finance-reports', false, false, false),
('packing', 'finance-reports', false, false, false),
('hr', 'finance-reports', false, false, false),
('sales', 'finance-settings', false, false, false),
('design', 'finance-settings', false, false, false),
('production', 'finance-settings', false, false, false),
('quality', 'finance-settings', false, false, false),
('packing', 'finance-settings', false, false, false),
('hr', 'finance-settings', false, false, false);

-- Logistics section
INSERT INTO department_defaults (department_type, page_key, can_view, can_access_route, can_mutate) VALUES
-- Gate Register: Admin, Finance, Production, QC, Packaging
('sales', 'gate-register', false, false, false),
('design', 'gate-register', false, false, false),
('production', 'gate-register', true, true, true),
('quality', 'gate-register', true, true, false),
('packing', 'gate-register', true, true, true),
('hr', 'gate-register', false, false, false),
('stores', 'gate-register', true, true, true),
('transport', 'gate-register', true, true, true),
-- Logistics Dashboard: Admin, Finance, Packaging
('sales', 'logistics-dashboard', false, false, false),
('design', 'logistics-dashboard', false, false, false),
('production', 'logistics-dashboard', false, false, false),
('quality', 'logistics-dashboard', false, false, false),
('packing', 'logistics-dashboard', true, true, false),
('hr', 'logistics-dashboard', false, false, false),
('stores', 'logistics-dashboard', true, true, false),
('transport', 'logistics-dashboard', true, true, true),
-- Finished Goods: Admin, Finance, Sales, Packaging
('sales', 'finished-goods', true, true, false),
('design', 'finished-goods', false, false, false),
('production', 'finished-goods', false, false, false),
('quality', 'finished-goods', false, false, false),
('packing', 'finished-goods', true, true, true),
('hr', 'finished-goods', false, false, false),
('stores', 'finished-goods', true, true, true),
('transport', 'finished-goods', true, true, false),
-- Packing: Admin, Finance, Sales, Packaging
('sales', 'packing', true, true, false),
('design', 'packing', false, false, false),
('production', 'packing', false, false, false),
('quality', 'packing', false, false, false),
('packing', 'packing', true, true, true),
('hr', 'packing', false, false, false),
('stores', 'packing', true, true, false),
('transport', 'packing', true, true, false),
-- Dispatch: Admin, Finance, Sales, Packaging
('sales', 'dispatch', true, true, false),
('design', 'dispatch', false, false, false),
('production', 'dispatch', false, false, false),
('quality', 'dispatch', false, false, false),
('packing', 'dispatch', true, true, true),
('hr', 'dispatch', false, false, false),
('stores', 'dispatch', true, true, false),
('transport', 'dispatch', true, true, true);

-- External Processes section (Admin, Finance only)
INSERT INTO department_defaults (department_type, page_key, can_view, can_access_route, can_mutate) VALUES
('sales', 'partner-dashboard', false, false, false),
('design', 'partner-dashboard', false, false, false),
('production', 'partner-dashboard', false, false, false),
('quality', 'partner-dashboard', false, false, false),
('packing', 'partner-dashboard', false, false, false),
('hr', 'partner-dashboard', false, false, false),
('stores', 'partner-dashboard', false, false, false),
('transport', 'partner-dashboard', false, false, false),
('sales', 'external-analytics', false, false, false),
('design', 'external-analytics', false, false, false),
('production', 'external-analytics', false, false, false),
('quality', 'external-analytics', false, false, false),
('packing', 'external-analytics', false, false, false),
('hr', 'external-analytics', false, false, false),
('stores', 'external-analytics', false, false, false),
('transport', 'external-analytics', false, false, false);

-- Admin section (Admin, Finance only)
INSERT INTO department_defaults (department_type, page_key, can_view, can_access_route, can_mutate) VALUES
('sales', 'admin-panel', false, false, false),
('design', 'admin-panel', false, false, false),
('production', 'admin-panel', false, false, false),
('quality', 'admin-panel', false, false, false),
('packing', 'admin-panel', false, false, false),
('hr', 'admin-panel', false, false, false),
('stores', 'admin-panel', false, false, false),
('transport', 'admin-panel', false, false, false),
('sales', 'factory-calendar', false, false, false),
('design', 'factory-calendar', false, false, false),
('production', 'factory-calendar', false, false, false),
('quality', 'factory-calendar', false, false, false),
('packing', 'factory-calendar', false, false, false),
('hr', 'factory-calendar', false, false, false),
('stores', 'factory-calendar', false, false, false),
('transport', 'factory-calendar', false, false, false);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_department_defaults_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_department_defaults_updated_at ON department_defaults;
CREATE TRIGGER tr_department_defaults_updated_at
BEFORE UPDATE ON department_defaults
FOR EACH ROW
EXECUTE FUNCTION update_department_defaults_updated_at();