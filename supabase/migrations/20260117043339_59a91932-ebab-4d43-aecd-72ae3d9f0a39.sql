-- =============================================================================
-- COMPREHENSIVE RLS POLICY FIX
-- Convert all has_role()-based policies to department-based permissions
-- using is_admin_department() for admin checks
-- =============================================================================

-- First, create a helper function for department-based role checks
-- Cast text to department_type enum
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

-- Helper for multiple department type checks
CREATE OR REPLACE FUNCTION public.has_any_department_type(_user_id uuid, _dept_types text[])
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
      AND d.type::text = ANY(_dept_types)
  )
$$;

-- =============================================================================
-- FIX user_permission_overrides POLICIES
-- =============================================================================
DROP POLICY IF EXISTS "Admin can manage user permission overrides" ON public.user_permission_overrides;
DROP POLICY IF EXISTS "Admins can manage permission overrides" ON public.user_permission_overrides;
DROP POLICY IF EXISTS "Users can view own permission overrides" ON public.user_permission_overrides;

CREATE POLICY "Admin departments can manage permission overrides"
ON public.user_permission_overrides
FOR ALL
TO authenticated
USING (
  auth.uid() = user_id 
  OR is_admin_department(auth.uid())
)
WITH CHECK (
  is_admin_department(auth.uid())
);

-- =============================================================================
-- FIX shipments POLICY
-- =============================================================================
DROP POLICY IF EXISTS "Admins can manage shipments" ON public.shipments;

CREATE POLICY "Admin and logistics can manage shipments"
ON public.shipments
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'packing'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'packing'])
);

-- =============================================================================
-- FIX suppliers POLICIES
-- =============================================================================
DROP POLICY IF EXISTS "Purchase and admin can manage suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Purchase can manage suppliers" ON public.suppliers;

CREATE POLICY "Admin and purchase can manage suppliers"
ON public.suppliers
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production'])
);

-- =============================================================================
-- FIX raw_purchase_orders POLICIES
-- =============================================================================
DROP POLICY IF EXISTS "Purchase and admin can update RPOs" ON public.raw_purchase_orders;
DROP POLICY IF EXISTS "Purchase managers can update RPOs" ON public.raw_purchase_orders;
DROP POLICY IF EXISTS "Admins can delete RPOs" ON public.raw_purchase_orders;

CREATE POLICY "Admin and production can manage RPOs"
ON public.raw_purchase_orders
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production'])
);

-- =============================================================================
-- FIX qc_measurements POLICIES
-- =============================================================================
DROP POLICY IF EXISTS "Quality users can update QC measurements" ON public.qc_measurements;

CREATE POLICY "Quality and admin can update QC measurements"
ON public.qc_measurements
FOR UPDATE
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'quality'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'quality'])
);

-- =============================================================================
-- FIX inventory_lots POLICIES
-- =============================================================================
DROP POLICY IF EXISTS "Stores and purchase can manage inventory lots" ON public.inventory_lots;

CREATE POLICY "Admin packing and production can manage inventory lots"
ON public.inventory_lots
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'packing', 'production'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'packing', 'production'])
);

-- =============================================================================
-- FIX purchase_settings POLICIES
-- =============================================================================
DROP POLICY IF EXISTS "Purchase and admin can update settings" ON public.purchase_settings;

CREATE POLICY "Admin can update purchase settings"
ON public.purchase_settings
FOR UPDATE
TO authenticated
USING (
  is_admin_department(auth.uid())
)
WITH CHECK (
  is_admin_department(auth.uid())
);

-- =============================================================================
-- FIX qc_summary POLICIES
-- =============================================================================
DROP POLICY IF EXISTS "Quality and production can manage QC summary" ON public.qc_summary;

CREATE POLICY "Quality production and admin can manage QC summary"
ON public.qc_summary
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'quality', 'production'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'quality', 'production'])
);

-- =============================================================================
-- FIX raw_po_receipts POLICIES
-- =============================================================================
DROP POLICY IF EXISTS "Stores can update receipts limited" ON public.raw_po_receipts;

CREATE POLICY "Admin packing production and finance can update receipts"
ON public.raw_po_receipts
FOR UPDATE
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'packing', 'production'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'packing', 'production'])
);

-- =============================================================================
-- FIX sales_order_items POLICIES
-- =============================================================================
DROP POLICY IF EXISTS "Sales and admin can manage sales order items" ON public.sales_order_items;

CREATE POLICY "Sales and admin can manage sales order items"
ON public.sales_order_items
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'sales'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'sales'])
);

-- =============================================================================
-- FIX invoices POLICIES
-- =============================================================================
DROP POLICY IF EXISTS "Accounts and admin can manage invoices" ON public.invoices;

CREATE POLICY "Finance and admin can manage invoices"
ON public.invoices
FOR ALL
TO authenticated
USING (
  is_admin_department(auth.uid())
)
WITH CHECK (
  is_admin_department(auth.uid())
);

-- =============================================================================
-- FIX invoice_items POLICIES
-- =============================================================================
DROP POLICY IF EXISTS "Accounts and admin can manage invoice items" ON public.invoice_items;

CREATE POLICY "Finance and admin can manage invoice items"
ON public.invoice_items
FOR ALL
TO authenticated
USING (
  is_admin_department(auth.uid())
)
WITH CHECK (
  is_admin_department(auth.uid())
);

-- =============================================================================
-- FIX payments POLICIES
-- =============================================================================
DROP POLICY IF EXISTS "Accounts and admin can manage payments" ON public.payments;

CREATE POLICY "Finance and admin can manage payments"
ON public.payments
FOR ALL
TO authenticated
USING (
  is_admin_department(auth.uid())
)
WITH CHECK (
  is_admin_department(auth.uid())
);

-- =============================================================================
-- FIX shipment_events POLICIES
-- =============================================================================
DROP POLICY IF EXISTS "Packing and admin can manage shipment events" ON public.shipment_events;

CREATE POLICY "Packing and admin can manage shipment events"
ON public.shipment_events
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'packing'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'packing'])
);

-- =============================================================================
-- FIX sites POLICIES
-- =============================================================================
DROP POLICY IF EXISTS "Users can view their site" ON public.sites;

CREATE POLICY "Users can view sites"
ON public.sites
FOR SELECT
TO authenticated
USING (true);

-- =============================================================================
-- FIX machines POLICIES
-- =============================================================================
DROP POLICY IF EXISTS "Users can view machines in their site" ON public.machines;

CREATE POLICY "Users can view machines"
ON public.machines
FOR SELECT
TO authenticated
USING (true);