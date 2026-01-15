
-- ===========================================
-- FIX ALL REMAINING HAS_ROLE POLICIES - BATCH 3
-- ===========================================

-- MATERIAL_LOTS
DROP POLICY IF EXISTS "Stores can create material lots" ON public.material_lots;
DROP POLICY IF EXISTS "Stores can update material lots" ON public.material_lots;
DROP POLICY IF EXISTS "Quality can update material lots" ON public.material_lots;
DROP POLICY IF EXISTS "Admins can manage material lots" ON public.material_lots;

CREATE POLICY "Production and admin can manage material lots" 
ON public.material_lots FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production') OR
  has_department_type(auth.uid(), 'quality')
);

-- ROUTING_STEPS
DROP POLICY IF EXISTS "Production can manage routing steps" ON public.routing_steps;
DROP POLICY IF EXISTS "Admins can manage routing steps" ON public.routing_steps;

CREATE POLICY "Production and admin can manage routing steps" 
ON public.routing_steps FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production')
);

-- PALLETS
DROP POLICY IF EXISTS "Packing can manage pallets" ON public.pallets;
DROP POLICY IF EXISTS "Admins can manage pallets" ON public.pallets;

CREATE POLICY "Packing and admin can manage pallets" 
ON public.pallets FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'packing')
);

-- PALLET_CARTONS
DROP POLICY IF EXISTS "Packing can manage pallet cartons" ON public.pallet_cartons;

CREATE POLICY "Packing and admin can manage pallet cartons" 
ON public.pallet_cartons FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'packing')
);

-- SHIPMENT_PALLETS
DROP POLICY IF EXISTS "Accounts can manage shipment pallets" ON public.shipment_pallets;

CREATE POLICY "Packing and admin can manage shipment pallets" 
ON public.shipment_pallets FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'packing')
);

-- Update remaining SHIPMENTS policies
DROP POLICY IF EXISTS "Accounts can manage shipments" ON public.shipments;

-- PURCHASE_ORDERS
DROP POLICY IF EXISTS "Purchase can manage purchase orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Admins can manage purchase orders" ON public.purchase_orders;

CREATE POLICY "Admin can manage purchase orders" 
ON public.purchase_orders FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- LASER_MARKING
DROP POLICY IF EXISTS "Packing can create laser marking" ON public.laser_marking;

CREATE POLICY "Packing and admin can manage laser marking" 
ON public.laser_marking FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'packing')
);

-- HOURLY_QC_CHECKS - Fix remaining
DROP POLICY IF EXISTS "Quality supervisors can view all hourly QC checks" ON public.hourly_qc_checks;

-- WO_MACHINE_ASSIGNMENTS
DROP POLICY IF EXISTS "Production can manage machine assignments" ON public.wo_machine_assignments;

CREATE POLICY "Production and admin can manage machine assignments" 
ON public.wo_machine_assignments FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production')
);

-- PROCESS_FLOW
DROP POLICY IF EXISTS "Admins can manage process flow" ON public.process_flow;

CREATE POLICY "Admin can manage process flow" 
ON public.process_flow FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- NCR_ACTIONS
DROP POLICY IF EXISTS "Quality can manage NCR actions" ON public.ncr_actions;

CREATE POLICY "Quality and admin can manage NCR actions" 
ON public.ncr_actions FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'quality')
);

-- SALES_ORDER_LINE_ITEMS
DROP POLICY IF EXISTS "Sales can create sales order line items" ON public.sales_order_line_items;
DROP POLICY IF EXISTS "Sales can update sales order line items" ON public.sales_order_line_items;
DROP POLICY IF EXISTS "Admins can manage sales order line items" ON public.sales_order_line_items;

CREATE POLICY "Sales and admin can manage sales order line items" 
ON public.sales_order_line_items FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'sales')
);

-- PRODUCTION_LOGS
DROP POLICY IF EXISTS "Production and operators can create logs" ON public.production_logs;
DROP POLICY IF EXISTS "Production can update logs" ON public.production_logs;

CREATE POLICY "Production and admin can manage production logs" 
ON public.production_logs FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production')
);

-- ROLE_PERMISSIONS
DROP POLICY IF EXISTS "Only admins can manage permissions" ON public.role_permissions;

CREATE POLICY "Admin can manage role permissions" 
ON public.role_permissions FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- USER_AUDIT_LOG
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.user_audit_log;

CREATE POLICY "Admin can view user audit logs" 
ON public.user_audit_log FOR SELECT 
TO authenticated
USING (is_admin_user(auth.uid()));

-- MATERIAL_ISSUES - Update
DROP POLICY IF EXISTS "Stores and production can create material issues" ON public.material_issues;

-- WO_MATERIAL_ISSUES
DROP POLICY IF EXISTS "Stores can create material issues" ON public.wo_material_issues;

CREATE POLICY "Production and admin can manage WO material issues" 
ON public.wo_material_issues FOR ALL 
TO authenticated
USING (
  is_admin_user(auth.uid()) OR 
  has_department_type(auth.uid(), 'production')
);

-- RAW_PURCHASE_ORDERS - update remaining
DROP POLICY IF EXISTS "Purchase managers can create RPOs" ON public.raw_purchase_orders;

-- RAW_PO_RECONCILIATIONS
DROP POLICY IF EXISTS "Purchase and finance can update reconciliations" ON public.raw_po_reconciliations;

CREATE POLICY "Admin can manage raw PO reconciliations" 
ON public.raw_po_reconciliations FOR ALL 
TO authenticated
USING (is_admin_user(auth.uid()));

-- Fix remaining WORK_ORDERS policies
DROP POLICY IF EXISTS "Production and sales can create work orders" ON public.work_orders;
DROP POLICY IF EXISTS "Production can update work orders" ON public.work_orders;
DROP POLICY IF EXISTS "Quality can update work orders" ON public.work_orders;
DROP POLICY IF EXISTS "Admins can manage work orders" ON public.work_orders;

-- Fix remaining QC_RECORDS policies
DROP POLICY IF EXISTS "Quality can manage QC records" ON public.qc_records;
DROP POLICY IF EXISTS "Admins can manage QC records" ON public.qc_records;
DROP POLICY IF EXISTS "Quality users can manage QC records" ON public.qc_records;

-- Fix remaining SALES_ORDERS policies
DROP POLICY IF EXISTS "Sales can create sales orders" ON public.sales_orders;
DROP POLICY IF EXISTS "Sales can update sales orders" ON public.sales_orders;
DROP POLICY IF EXISTS "Admins can manage sales orders" ON public.sales_orders;

-- Fix MACHINES remaining policy
DROP POLICY IF EXISTS "Production can manage machines" ON public.machines;
