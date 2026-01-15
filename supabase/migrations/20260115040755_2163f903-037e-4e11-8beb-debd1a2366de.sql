
-- ===========================================
-- FIX REMAINING RLS POLICIES USING HAS_ROLE
-- Only for tables that exist
-- ===========================================

-- FIX EXECUTION_RECORDS TABLE POLICIES
DROP POLICY IF EXISTS "Production can manage execution records" ON public.execution_records;

CREATE POLICY "Production and admin can manage execution records" 
ON public.execution_records FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production')
);

-- FIX GATE_REGISTER TABLE POLICIES
DROP POLICY IF EXISTS "Logistics can manage gate register" ON public.gate_register;

CREATE POLICY "Packing and admin can manage gate register" 
ON public.gate_register FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'packing')
);

-- FIX HOURLY_QC_CHECKS TABLE POLICIES
DROP POLICY IF EXISTS "Quality can manage hourly QC readings" ON public.hourly_qc_checks;

CREATE POLICY "Quality and admin can manage hourly QC checks" 
ON public.hourly_qc_checks FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'quality')
);

-- FIX MEASUREMENT_INSTRUMENTS TABLE POLICIES
DROP POLICY IF EXISTS "Admins can manage instruments" ON public.measurement_instruments;

CREATE POLICY "Admin users can manage instruments" 
ON public.measurement_instruments FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- FIX INVOICE_CLOSURE_ADJUSTMENTS TABLE POLICIES
DROP POLICY IF EXISTS "Finance can manage invoice adjustments" ON public.invoice_closure_adjustments;

CREATE POLICY "Finance can manage invoice closure adjustments" 
ON public.invoice_closure_adjustments FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- FIX INVOICES TABLE POLICIES
DROP POLICY IF EXISTS "Finance roles can manage invoices" ON public.invoices;
DROP POLICY IF EXISTS "Finance roles can view invoices" ON public.invoices;

CREATE POLICY "Finance can view invoices" 
ON public.invoices FOR SELECT 
TO authenticated
USING (is_admin_user(auth.uid()));

CREATE POLICY "Finance can manage invoices" 
ON public.invoices FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- FIX ITEM_MASTER TABLE POLICIES
DROP POLICY IF EXISTS "Admin can manage item master" ON public.item_master;
DROP POLICY IF EXISTS "Authorized roles can view item master" ON public.item_master;

CREATE POLICY "All authenticated can view item master" 
ON public.item_master FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Admin and design can manage item master" 
ON public.item_master FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'design')
);

-- FIX MAINTENANCE_LOGS TABLE POLICIES  
DROP POLICY IF EXISTS "Admin can manage maintenance logs" ON public.maintenance_logs;

CREATE POLICY "Admin can manage maintenance logs" 
ON public.maintenance_logs FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- FIX MACHINES TABLE POLICIES
DROP POLICY IF EXISTS "Admins can manage machines" ON public.machines;

CREATE POLICY "Admin can manage machines" 
ON public.machines FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- FIX MATERIAL_ISSUES TABLE POLICIES
DROP POLICY IF EXISTS "Authorized roles can manage material inwards" ON public.material_issues;

CREATE POLICY "Production and admin can manage material issues" 
ON public.material_issues FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production')
);

-- FIX NCRs TABLE POLICIES
DROP POLICY IF EXISTS "Quality and admin can manage NCRs" ON public.ncrs;

CREATE POLICY "Quality and admin can manage NCRs" 
ON public.ncrs FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'quality')
);

-- FIX OPERATION_ROUTES TABLE POLICIES
DROP POLICY IF EXISTS "Production and admin can manage operation routes" ON public.operation_routes;

CREATE POLICY "Production and admin can manage operation routes" 
ON public.operation_routes FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production')
);

-- FIX PEOPLE TABLE POLICIES
DROP POLICY IF EXISTS "Admins can manage people" ON public.people;

CREATE POLICY "Admin can manage people" 
ON public.people FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- FIX PRODUCTION_BATCHES TABLE POLICIES
DROP POLICY IF EXISTS "Production can manage batches" ON public.production_batches;

CREATE POLICY "Production and admin can manage batches" 
ON public.production_batches FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production')
);

-- FIX QC_RECORDS TABLE POLICIES
DROP POLICY IF EXISTS "Quality can manage QC reports" ON public.qc_records;

CREATE POLICY "Quality and admin can manage QC records" 
ON public.qc_records FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'quality')
);

-- FIX RAW_PURCHASE_ORDERS TABLE POLICIES
DROP POLICY IF EXISTS "Authorized roles can view raw POs" ON public.raw_purchase_orders;
DROP POLICY IF EXISTS "Admin can manage raw POs" ON public.raw_purchase_orders;

CREATE POLICY "Production and admin can view raw POs" 
ON public.raw_purchase_orders FOR SELECT 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production')
);

CREATE POLICY "Admin can manage raw POs" 
ON public.raw_purchase_orders FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- FIX SALES_ORDERS TABLE POLICIES
DROP POLICY IF EXISTS "Sales and admin can manage sales orders" ON public.sales_orders;
DROP POLICY IF EXISTS "Authorized roles can view sales orders" ON public.sales_orders;

CREATE POLICY "Sales and admin can view sales orders" 
ON public.sales_orders FOR SELECT 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'sales') OR
  has_department_type(auth.uid(), 'production')
);

CREATE POLICY "Sales and admin can manage sales orders" 
ON public.sales_orders FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'sales')
);

-- FIX SHE_INCIDENTS TABLE POLICIES
DROP POLICY IF EXISTS "Admin can manage SHE incidents" ON public.she_incidents;

CREATE POLICY "Admin can manage SHE incidents" 
ON public.she_incidents FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- FIX SHIPMENTS TABLE POLICIES
DROP POLICY IF EXISTS "Logistics and admin can manage shipments" ON public.shipments;

CREATE POLICY "Packing and admin can manage shipments" 
ON public.shipments FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'packing')
);

-- FIX SITES TABLE POLICIES
DROP POLICY IF EXISTS "Admins can manage sites" ON public.sites;

CREATE POLICY "Admin can manage sites" 
ON public.sites FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- FIX SUPPLIER_PAYMENTS TABLE POLICIES
DROP POLICY IF EXISTS "Finance can manage supplier payments" ON public.supplier_payments;

CREATE POLICY "Finance can manage supplier payments" 
ON public.supplier_payments FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- FIX SUPPLIERS TABLE POLICIES
DROP POLICY IF EXISTS "Admin can manage suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Authorized roles can view suppliers" ON public.suppliers;

CREATE POLICY "Authorized can view suppliers" 
ON public.suppliers FOR SELECT 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production')
);

CREATE POLICY "Admin can manage suppliers" 
ON public.suppliers FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- FIX USER_PERMISSION_OVERRIDES TABLE POLICIES
DROP POLICY IF EXISTS "Admins can manage user permission overrides" ON public.user_permission_overrides;

CREATE POLICY "Admin can manage user permission overrides" 
ON public.user_permission_overrides FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- FIX WORK_ORDERS TABLE POLICIES
DROP POLICY IF EXISTS "Production can manage work orders" ON public.work_orders;
DROP POLICY IF EXISTS "Authorized roles can view work orders" ON public.work_orders;

CREATE POLICY "Authorized can view work orders" 
ON public.work_orders FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Production and admin can manage work orders" 
ON public.work_orders FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production')
);

-- FIX FORGING_RECORDS TABLE POLICIES
DROP POLICY IF EXISTS "Production can manage forging batches" ON public.forging_records;

CREATE POLICY "Production and admin can manage forging records" 
ON public.forging_records FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production')
);

-- FIX GRN_RECEIPTS TABLE POLICIES
DROP POLICY IF EXISTS "Production can manage GRN" ON public.grn_receipts;

CREATE POLICY "Production and admin can manage GRN receipts" 
ON public.grn_receipts FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production')
);
