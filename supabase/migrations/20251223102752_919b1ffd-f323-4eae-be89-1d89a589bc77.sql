-- Remove remaining overly permissive SELECT policies that bypass role-based access
-- These duplicate policies exist alongside role-based ones and effectively negate security

-- ============================================
-- WORK_ORDERS: Remove "Authenticated users can view work orders" (USING true)
-- Production/Quality/Sales/Accounts need access, not everyone
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view work orders" ON work_orders;

CREATE POLICY "Authorized roles can view work orders"
ON work_orders FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'production'::app_role) OR 
  has_role(auth.uid(), 'quality'::app_role) OR
  has_role(auth.uid(), 'sales'::app_role) OR
  has_role(auth.uid(), 'stores'::app_role) OR
  has_role(auth.uid(), 'packing'::app_role) OR
  has_role(auth.uid(), 'logistics'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- SUPPLIERS: Remove duplicate permissive policy
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view suppliers" ON suppliers;

-- ============================================
-- RAW_PURCHASE_ORDERS: Remove duplicate permissive policy
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view RPOs" ON raw_purchase_orders;

-- ============================================
-- SHIPMENTS: Restrict to logistics, packing, accounts, admin
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view shipments" ON shipments;

CREATE POLICY "Authorized roles can view shipments"
ON shipments FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'logistics'::app_role) OR 
  has_role(auth.uid(), 'packing'::app_role) OR
  has_role(auth.uid(), 'accounts'::app_role) OR
  has_role(auth.uid(), 'sales'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- SALES_BOOKINGS: Restrict to sales, accounts, admin
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view bookings" ON sales_bookings;

CREATE POLICY "Authorized roles can view bookings"
ON sales_bookings FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'sales'::app_role) OR 
  has_role(auth.uid(), 'accounts'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- ============================================
-- INVENTORY_LOTS: Remove any remaining permissive policies
-- ============================================
DROP POLICY IF EXISTS "Everyone can view inventory lots" ON inventory_lots;
DROP POLICY IF EXISTS "Authenticated users can view inventory lots" ON inventory_lots;

-- ============================================
-- USER_ROLES: Remove overly permissive policy 
-- ============================================
DROP POLICY IF EXISTS "Users can view user roles" ON user_roles;