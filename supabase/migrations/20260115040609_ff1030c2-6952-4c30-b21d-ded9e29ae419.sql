
-- ===========================================
-- COMPREHENSIVE RLS POLICY FIX
-- Convert from old user_roles/has_role() system
-- to new department-based permission system
-- ===========================================

-- Step 1: Create a new helper function that checks department type
-- This replaces has_role() with department-based checks
CREATE OR REPLACE FUNCTION public.has_department_type(_user_id uuid, _dept_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.departments d ON p.department_id = d.id
    WHERE p.id = _user_id
      AND d.type = _dept_type::department_type
  )
$$;

-- Step 2: Create a function to check if user is admin (admin, finance, or super_admin)
CREATE OR REPLACE FUNCTION public.is_admin_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.departments d ON p.department_id = d.id
    WHERE p.id = _user_id
      AND d.type IN ('admin', 'finance', 'super_admin')
  )
$$;

-- Step 3: Create a function to check if user is super admin only
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.departments d ON p.department_id = d.id
    WHERE p.id = _user_id
      AND d.type = 'super_admin'
  )
$$;

-- ===========================================
-- FIX EXTERNAL_PARTNERS TABLE POLICIES
-- ===========================================
DROP POLICY IF EXISTS "Authorized roles can view external partners" ON public.external_partners;
DROP POLICY IF EXISTS "Allow insert external_partners" ON public.external_partners;
DROP POLICY IF EXISTS "Allow update external_partners" ON public.external_partners;
DROP POLICY IF EXISTS "Allow delete external_partners" ON public.external_partners;

-- All authenticated users who are admin/finance/super_admin/production/packing can view
CREATE POLICY "Department users can view external partners" 
ON public.external_partners FOR SELECT 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production') OR 
  has_department_type(auth.uid(), 'packing')
);

-- Admin users can insert
CREATE POLICY "Admin users can insert external partners" 
ON public.external_partners FOR INSERT 
TO authenticated
WITH CHECK (is_admin_user(auth.uid()));

-- Admin users can update
CREATE POLICY "Admin users can update external partners" 
ON public.external_partners FOR UPDATE 
TO authenticated
USING (is_admin_user(auth.uid()));

-- Only super admin can delete
CREATE POLICY "Super admin can delete external partners" 
ON public.external_partners FOR DELETE 
TO authenticated
USING (is_super_admin(auth.uid()));

-- ===========================================
-- FIX SUPPLIER_ACCOUNTS TABLE POLICIES
-- ===========================================
DROP POLICY IF EXISTS "Admins can manage supplier accounts" ON public.supplier_accounts;
DROP POLICY IF EXISTS "Authenticated users can view supplier accounts" ON public.supplier_accounts;

-- Admin users can view all supplier accounts
CREATE POLICY "Admin users can view supplier accounts" 
ON public.supplier_accounts FOR SELECT 
TO authenticated
USING (is_admin_user(auth.uid()));

-- Admin users can insert supplier accounts
CREATE POLICY "Admin users can insert supplier accounts" 
ON public.supplier_accounts FOR INSERT 
TO authenticated
WITH CHECK (is_admin_user(auth.uid()));

-- Admin users can update supplier accounts
CREATE POLICY "Admin users can update supplier accounts" 
ON public.supplier_accounts FOR UPDATE 
TO authenticated
USING (is_admin_user(auth.uid()));

-- Only super admin can delete supplier accounts
CREATE POLICY "Super admin can delete supplier accounts" 
ON public.supplier_accounts FOR DELETE 
TO authenticated
USING (is_super_admin(auth.uid()));

-- ===========================================
-- FIX AR_FOLLOWUPS TABLE POLICIES
-- ===========================================
DROP POLICY IF EXISTS "Accounts and admin can manage follow-ups" ON public.ar_followups;
DROP POLICY IF EXISTS "Finance roles can view follow-ups" ON public.ar_followups;

CREATE POLICY "Finance users can view follow-ups" 
ON public.ar_followups FOR SELECT 
TO authenticated
USING (is_admin_user(auth.uid()));

CREATE POLICY "Finance users can manage follow-ups" 
ON public.ar_followups FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- ===========================================
-- FIX CARTONS TABLE POLICIES
-- ===========================================
DROP POLICY IF EXISTS "Admins can manage cartons" ON public.cartons;
DROP POLICY IF EXISTS "Packing can manage cartons" ON public.cartons;

CREATE POLICY "Packing and admin can manage cartons" 
ON public.cartons FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'packing')
);

-- ===========================================
-- FIX CUSTOMER_MASTER TABLE POLICIES
-- ===========================================
DROP POLICY IF EXISTS "Authorized roles can view customers" ON public.customer_master;
DROP POLICY IF EXISTS "Sales and admin can insert customers" ON public.customer_master;
DROP POLICY IF EXISTS "Sales and admin can update customers" ON public.customer_master;

CREATE POLICY "Authorized departments can view customers" 
ON public.customer_master FOR SELECT 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'sales')
);

CREATE POLICY "Sales and admin can insert customers" 
ON public.customer_master FOR INSERT 
TO authenticated
WITH CHECK (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'sales')
);

CREATE POLICY "Sales and admin can update customers" 
ON public.customer_master FOR UPDATE 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'sales')
);

-- ===========================================
-- FIX CUSTOMER_RECEIPTS TABLE POLICIES
-- ===========================================
DROP POLICY IF EXISTS "Accounts and admin can manage receipts" ON public.customer_receipts;
DROP POLICY IF EXISTS "Finance roles can view receipts" ON public.customer_receipts;

CREATE POLICY "Finance users can view receipts" 
ON public.customer_receipts FOR SELECT 
TO authenticated
USING (is_admin_user(auth.uid()));

CREATE POLICY "Finance users can manage receipts" 
ON public.customer_receipts FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- ===========================================
-- FIX CUTTING_RECORDS TABLE POLICIES
-- ===========================================
DROP POLICY IF EXISTS "Production can manage cutting records" ON public.cutting_records;

CREATE POLICY "Production and admin can manage cutting records" 
ON public.cutting_records FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production')
);

-- ===========================================
-- FIX DAILY_PRODUCTION_LOGS TABLE POLICIES
-- ===========================================
DROP POLICY IF EXISTS "Production can manage daily production logs" ON public.daily_production_logs;

CREATE POLICY "Production and admin can manage daily production logs" 
ON public.daily_production_logs FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production')
);

-- ===========================================
-- FIX DEPARTMENT_DEFAULTS TABLE POLICIES
-- ===========================================
DROP POLICY IF EXISTS "Admins can manage department_defaults" ON public.department_defaults;

CREATE POLICY "Admin users can manage department_defaults" 
ON public.department_defaults FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- ===========================================
-- FIX DEPARTMENTS TABLE POLICIES
-- ===========================================
DROP POLICY IF EXISTS "Admins can manage departments" ON public.departments;

CREATE POLICY "Admin users can manage departments" 
ON public.departments FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- ===========================================
-- FIX DESIGN_FILES TABLE POLICIES
-- ===========================================
DROP POLICY IF EXISTS "Production and quality can upload design files" ON public.design_files;

CREATE POLICY "Production and quality can upload design files" 
ON public.design_files FOR INSERT 
TO authenticated
WITH CHECK (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production') OR 
  has_department_type(auth.uid(), 'quality') OR
  has_department_type(auth.uid(), 'design')
);

-- ===========================================
-- FIX DIMENSION_TOLERANCES TABLE POLICIES
-- ===========================================
DROP POLICY IF EXISTS "Admins can manage dimension tolerances" ON public.dimension_tolerances;
DROP POLICY IF EXISTS "Managers can insert tolerances" ON public.dimension_tolerances;
DROP POLICY IF EXISTS "Managers can update tolerances" ON public.dimension_tolerances;
DROP POLICY IF EXISTS "Managers can delete tolerances" ON public.dimension_tolerances;

CREATE POLICY "Admin and production can manage tolerances" 
ON public.dimension_tolerances FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production') OR 
  has_department_type(auth.uid(), 'quality')
);

-- ===========================================
-- FIX DISPATCH_NOTES TABLE POLICIES
-- ===========================================
DROP POLICY IF EXISTS "Logistics and admin can create dispatch notes" ON public.dispatch_notes;
DROP POLICY IF EXISTS "Authorized roles can update dispatch notes" ON public.dispatch_notes;

CREATE POLICY "Packing and admin can manage dispatch notes" 
ON public.dispatch_notes FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'packing')
);

-- ===========================================
-- FIX DISPATCH_QC_BATCHES TABLE POLICIES
-- ===========================================
DROP POLICY IF EXISTS "Quality and admin can manage dispatch QC batches" ON public.dispatch_qc_batches;

CREATE POLICY "Quality and admin can manage dispatch QC batches" 
ON public.dispatch_qc_batches FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'quality')
);

-- ===========================================
-- FIX DISPATCHES TABLE POLICIES
-- ===========================================
DROP POLICY IF EXISTS "Logistics and admin can manage dispatches" ON public.dispatches;

CREATE POLICY "Packing and admin can manage dispatches" 
ON public.dispatches FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'packing')
);

-- ===========================================
-- FIX EXTERNAL_MOVEMENTS TABLE POLICIES
-- ===========================================
DROP POLICY IF EXISTS "Production and admin can manage external movements" ON public.external_movements;
DROP POLICY IF EXISTS "Logistics can manage external movements" ON public.external_movements;

CREATE POLICY "Production packing admin can manage external movements" 
ON public.external_movements FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production') OR 
  has_department_type(auth.uid(), 'packing')
);

-- ===========================================
-- FIX CNC_PROGRAMMER_ACTIVITY TABLE POLICIES
-- ===========================================
DROP POLICY IF EXISTS "Production can manage CNC programmer activity" ON public.cnc_programmer_activity;

CREATE POLICY "Production and admin can manage CNC activity" 
ON public.cnc_programmer_activity FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production')
);

-- ===========================================
-- FIX CROSS_SECTION_SHAPES TABLE POLICIES
-- ===========================================
DROP POLICY IF EXISTS "Admin can manage cross_section_shapes" ON public.cross_section_shapes;

CREATE POLICY "Admin can manage cross_section_shapes" 
ON public.cross_section_shapes FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));
