-- Fix RLS policies: Replace USING (true) with role-based access controls
-- This addresses CLIENT_SIDE_AUTH and PUBLIC_DATA_EXPOSURE security issues

-- ============================================
-- CUSTOMER_MASTER: Restrict to sales, accounts, admin
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view customer master" ON customer_master;
DROP POLICY IF EXISTS "Authenticated users can insert customer master" ON customer_master;
DROP POLICY IF EXISTS "Authenticated users can update customer master" ON customer_master;

CREATE POLICY "Authorized roles can view customers"
ON customer_master FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'sales'::app_role) OR 
  has_role(auth.uid(), 'accounts'::app_role) OR 
  has_role(auth.uid(), 'finance_admin'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Sales and admin can insert customers"
ON customer_master FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'sales'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Sales and admin can update customers"
ON customer_master FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'sales'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- SUPPLIERS: Restrict to purchase, accounts, admin
-- ============================================
DROP POLICY IF EXISTS "Everyone can view suppliers" ON suppliers;
DROP POLICY IF EXISTS "Authenticated can view suppliers" ON suppliers;

CREATE POLICY "Authorized roles can view suppliers"
ON suppliers FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'purchase'::app_role) OR 
  has_role(auth.uid(), 'stores'::app_role) OR
  has_role(auth.uid(), 'accounts'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- INVOICES: Restrict to accounts, finance roles, admin
-- ============================================
DROP POLICY IF EXISTS "Anyone can view invoices" ON invoices;

CREATE POLICY "Finance roles can view invoices"
ON invoices FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'accounts'::app_role) OR 
  has_role(auth.uid(), 'finance_admin'::app_role) OR 
  has_role(auth.uid(), 'finance_user'::app_role) OR
  has_role(auth.uid(), 'sales'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- INVOICE_ITEMS: Restrict to accounts, finance roles, admin
-- ============================================
DROP POLICY IF EXISTS "Anyone can view invoice items" ON invoice_items;

CREATE POLICY "Finance roles can view invoice items"
ON invoice_items FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'accounts'::app_role) OR 
  has_role(auth.uid(), 'finance_admin'::app_role) OR 
  has_role(auth.uid(), 'finance_user'::app_role) OR
  has_role(auth.uid(), 'sales'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- PAYMENTS: Restrict to accounts, finance roles, admin
-- ============================================
DROP POLICY IF EXISTS "Anyone can view payments" ON payments;

CREATE POLICY "Finance roles can view payments"
ON payments FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'accounts'::app_role) OR 
  has_role(auth.uid(), 'finance_admin'::app_role) OR 
  has_role(auth.uid(), 'finance_user'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- AR_FOLLOWUPS: Restrict to accounts, finance roles, admin
-- ============================================
DROP POLICY IF EXISTS "Anyone can view follow-ups" ON ar_followups;

CREATE POLICY "Finance roles can view follow-ups"
ON ar_followups FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'accounts'::app_role) OR 
  has_role(auth.uid(), 'finance_admin'::app_role) OR 
  has_role(auth.uid(), 'finance_user'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- RAW_PURCHASE_ORDERS: Restrict to purchase, stores, accounts, admin
-- ============================================
DROP POLICY IF EXISTS "Everyone can view RPOs" ON raw_purchase_orders;

CREATE POLICY "Authorized roles can view RPOs"
ON raw_purchase_orders FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'purchase'::app_role) OR 
  has_role(auth.uid(), 'stores'::app_role) OR
  has_role(auth.uid(), 'accounts'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- RAW_MATERIAL_PO: Restrict to purchase, stores, accounts, admin
-- ============================================
DROP POLICY IF EXISTS "Everyone can view raw material POs" ON raw_material_po;

CREATE POLICY "Authorized roles can view raw material POs"
ON raw_material_po FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'purchase'::app_role) OR 
  has_role(auth.uid(), 'stores'::app_role) OR
  has_role(auth.uid(), 'accounts'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- GRN_RECEIPTS: Restrict to stores, purchase, accounts, admin
-- ============================================
DROP POLICY IF EXISTS "Everyone can view GRN receipts" ON grn_receipts;

CREATE POLICY "Authorized roles can view GRN receipts"
ON grn_receipts FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'stores'::app_role) OR 
  has_role(auth.uid(), 'purchase'::app_role) OR
  has_role(auth.uid(), 'accounts'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- INVENTORY_LOTS: Restrict to stores, purchase, production, admin
-- ============================================
DROP POLICY IF EXISTS "Everyone can view inventory lots" ON inventory_lots;
DROP POLICY IF EXISTS "Authenticated users can view inventory lots" ON inventory_lots;

CREATE POLICY "Authorized roles can view inventory"
ON inventory_lots FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'stores'::app_role) OR 
  has_role(auth.uid(), 'purchase'::app_role) OR
  has_role(auth.uid(), 'production'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- EXTERNAL_PARTNERS: Restrict to logistics, production, admin
-- ============================================
DROP POLICY IF EXISTS "Allow all read external_partners" ON external_partners;

CREATE POLICY "Authorized roles can view external partners"
ON external_partners FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'logistics'::app_role) OR 
  has_role(auth.uid(), 'production'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- PEOPLE: Restrict to production, quality, admin (employee roster)
-- ============================================
DROP POLICY IF EXISTS "Anyone can view people" ON people;

CREATE POLICY "Authorized roles can view people"
ON people FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'production'::app_role) OR 
  has_role(auth.uid(), 'quality'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- QC_RECORDS: Restrict to quality, production, admin
-- ============================================
DROP POLICY IF EXISTS "Anyone can view QC records" ON qc_records;
DROP POLICY IF EXISTS "Authenticated users can view QC records" ON qc_records;

CREATE POLICY "Authorized roles can view QC records"
ON qc_records FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'quality'::app_role) OR 
  has_role(auth.uid(), 'production'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- NCRS: Restrict to quality, production, admin
-- ============================================
DROP POLICY IF EXISTS "Everyone can view NCRs" ON ncrs;

CREATE POLICY "Authorized roles can view NCRs"
ON ncrs FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'quality'::app_role) OR 
  has_role(auth.uid(), 'production'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- HOURLY_QC_CHECKS: Restrict to quality, production, admin
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view hourly QC checks" ON hourly_qc_checks;

CREATE POLICY "Authorized roles can view hourly QC checks"
ON hourly_qc_checks FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'quality'::app_role) OR 
  has_role(auth.uid(), 'production'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- SALES_ORDERS: Restrict to sales, production, accounts, admin
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view sales orders" ON sales_orders;

CREATE POLICY "Authorized roles can view sales orders"
ON sales_orders FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'sales'::app_role) OR 
  has_role(auth.uid(), 'production'::app_role) OR
  has_role(auth.uid(), 'accounts'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- SALES_ORDER_ITEMS: Restrict to sales, production, accounts, admin
-- ============================================
DROP POLICY IF EXISTS "Anyone can view sales order items" ON sales_order_items;

CREATE POLICY "Authorized roles can view sales order items"
ON sales_order_items FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'sales'::app_role) OR 
  has_role(auth.uid(), 'production'::app_role) OR
  has_role(auth.uid(), 'accounts'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- PROFORMA_INVOICES: Restrict to sales, accounts, admin
-- ============================================
DROP POLICY IF EXISTS "Everyone can view proforma invoices" ON proforma_invoices;

CREATE POLICY "Authorized roles can view proforma invoices"
ON proforma_invoices FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'sales'::app_role) OR 
  has_role(auth.uid(), 'accounts'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- NCR_ACTIONS: Restrict to quality, production, admin
-- ============================================
DROP POLICY IF EXISTS "Anyone can view NCR actions" ON ncr_actions;

CREATE POLICY "Authorized roles can view NCR actions"
ON ncr_actions FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'quality'::app_role) OR 
  has_role(auth.uid(), 'production'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- QC_MEASUREMENTS: Restrict to quality, production, admin
-- ============================================
DROP POLICY IF EXISTS "Anyone can view QC measurements" ON qc_measurements;

CREATE POLICY "Authorized roles can view QC measurements"
ON qc_measurements FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'quality'::app_role) OR 
  has_role(auth.uid(), 'production'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);