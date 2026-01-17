-- =============================================================================
-- FIX REMAINING has_role()-based POLICIES - with proper DROP handling
-- =============================================================================

-- FIX forging_records policies
DROP POLICY IF EXISTS "Production and admin can manage forging records" ON public.forging_records;
DROP POLICY IF EXISTS "Production can manage forging records" ON public.forging_records;

CREATE POLICY "Production and admin can manage forging records"
ON public.forging_records
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production'])
);

-- FIX material_requirements_v2 policies
DROP POLICY IF EXISTS "Admin and production can manage material requirements" ON public.material_requirements_v2;
DROP POLICY IF EXISTS "Purchase and admin can update material requirements" ON public.material_requirements_v2;

CREATE POLICY "Admin and production can manage material requirements"
ON public.material_requirements_v2
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production'])
);

-- FIX qc_final_reports policies
DROP POLICY IF EXISTS "Quality and admin can manage QC final reports" ON public.qc_final_reports;

CREATE POLICY "Quality and admin can manage QC final reports"
ON public.qc_final_reports
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'quality'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'quality'])
);

-- FIX raw_material_po policies
DROP POLICY IF EXISTS "Admin and production can manage raw material POs" ON public.raw_material_po;
DROP POLICY IF EXISTS "Purchase and admin can create POs" ON public.raw_material_po;
DROP POLICY IF EXISTS "Purchase and admin can update POs" ON public.raw_material_po;

CREATE POLICY "Admin and production can manage raw material POs"
ON public.raw_material_po
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production'])
);

-- FIX grn_receipts policies
DROP POLICY IF EXISTS "Admin packing and production can manage GRN receipts" ON public.grn_receipts;
DROP POLICY IF EXISTS "Stores and admin can create GRN" ON public.grn_receipts;

CREATE POLICY "Admin packing and production can manage GRN receipts"
ON public.grn_receipts
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'packing', 'production'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'packing', 'production'])
);

-- FIX material_specs policies
DROP POLICY IF EXISTS "Admin and sales can manage material specs" ON public.material_specs;
DROP POLICY IF EXISTS "Admins and sales can manage material specs" ON public.material_specs;

CREATE POLICY "Admin and sales can manage material specs"
ON public.material_specs
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'sales', 'design'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'sales', 'design'])
);

-- FIX measurement_instruments policies
DROP POLICY IF EXISTS "Quality and admin can manage instruments" ON public.measurement_instruments;

CREATE POLICY "Quality and admin can manage instruments"
ON public.measurement_instruments
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'quality'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'quality'])
);

-- FIX proforma_invoices policies
DROP POLICY IF EXISTS "Sales and admin can manage proforma invoices" ON public.proforma_invoices;

CREATE POLICY "Sales and admin can manage proforma invoices"
ON public.proforma_invoices
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'sales'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'sales'])
);

-- FIX operation_routes policies
DROP POLICY IF EXISTS "Admin production and design can manage operation routes" ON public.operation_routes;
DROP POLICY IF EXISTS "Admin and production can manage operation routes" ON public.operation_routes;

CREATE POLICY "Admin production and design can manage operation routes"
ON public.operation_routes
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production', 'design'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production', 'design'])
);

-- FIX machine_utilisation_reviews policies
DROP POLICY IF EXISTS "Admin and production can manage utilisation reviews" ON public.machine_utilisation_reviews;
DROP POLICY IF EXISTS "Production and admin can manage utilisation reviews" ON public.machine_utilisation_reviews;

CREATE POLICY "Admin and production can manage utilisation reviews"
ON public.machine_utilisation_reviews
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production'])
);

-- FIX operator_production_ledger policies
DROP POLICY IF EXISTS "Admin and production can manage operator ledger" ON public.operator_production_ledger;
DROP POLICY IF EXISTS "Admins can manage operator ledger" ON public.operator_production_ledger;

CREATE POLICY "Admin and production can manage operator ledger"
ON public.operator_production_ledger
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production'])
);

-- FIX setter_activity_ledger policies
DROP POLICY IF EXISTS "Admin and production can manage setter activity" ON public.setter_activity_ledger;
DROP POLICY IF EXISTS "Production can manage setter activity" ON public.setter_activity_ledger;

CREATE POLICY "Admin and production can manage setter activity"
ON public.setter_activity_ledger
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production'])
);

-- FIX receipt_allocations policies
DROP POLICY IF EXISTS "Finance and admin can manage allocations" ON public.receipt_allocations;
DROP POLICY IF EXISTS "Accounts and admin can manage allocations" ON public.receipt_allocations;

CREATE POLICY "Finance and admin can manage allocations"
ON public.receipt_allocations
FOR ALL
TO authenticated
USING (is_admin_department(auth.uid()))
WITH CHECK (is_admin_department(auth.uid()));

-- FIX invoice_closure_adjustments policies
DROP POLICY IF EXISTS "Finance and admin can manage closure adjustments" ON public.invoice_closure_adjustments;
DROP POLICY IF EXISTS "Finance admin can create closure adjustments" ON public.invoice_closure_adjustments;

CREATE POLICY "Finance and admin can manage closure adjustments"
ON public.invoice_closure_adjustments
FOR ALL
TO authenticated
USING (is_admin_department(auth.uid()))
WITH CHECK (is_admin_department(auth.uid()));

-- FIX material_master policies
DROP POLICY IF EXISTS "Admin and production can manage material master" ON public.material_master;
DROP POLICY IF EXISTS "Admins can manage material master" ON public.material_master;

CREATE POLICY "Admin and production can manage material master"
ON public.material_master
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production'])
);

-- FIX nominal_sizes policies
DROP POLICY IF EXISTS "Admin can manage nominal sizes" ON public.nominal_sizes;
DROP POLICY IF EXISTS "Admin can manage nominal_sizes" ON public.nominal_sizes;

CREATE POLICY "Admin can manage nominal sizes"
ON public.nominal_sizes
FOR ALL
TO authenticated
USING (is_admin_department(auth.uid()))
WITH CHECK (is_admin_department(auth.uid()));

-- FIX production_batches policies
DROP POLICY IF EXISTS "Production and admin can manage production batches" ON public.production_batches;
DROP POLICY IF EXISTS "Production can manage production batches" ON public.production_batches;

CREATE POLICY "Production and admin can manage production batches"
ON public.production_batches
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production', 'quality'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production', 'quality'])
);

-- FIX finished_goods_inventory policies
DROP POLICY IF EXISTS "Production packing and admin can manage finished goods" ON public.finished_goods_inventory;
DROP POLICY IF EXISTS "Production and stores can manage inventory" ON public.finished_goods_inventory;

CREATE POLICY "Production packing and admin can manage finished goods"
ON public.finished_goods_inventory
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production', 'packing'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production', 'packing'])
);

-- FIX inventory_movements policies
DROP POLICY IF EXISTS "Production packing and admin can manage inventory movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Production and stores can create movements" ON public.inventory_movements;

CREATE POLICY "Production packing and admin can manage inventory movements"
ON public.inventory_movements
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production', 'packing'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'production', 'packing'])
);

-- FIX inventory_reservations policies
DROP POLICY IF EXISTS "Sales production and admin can manage reservations" ON public.inventory_reservations;
DROP POLICY IF EXISTS "Sales and production can manage reservations" ON public.inventory_reservations;

CREATE POLICY "Sales production and admin can manage reservations"
ON public.inventory_reservations
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'sales', 'production'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'sales', 'production'])
);

-- FIX sales_bookings policies
DROP POLICY IF EXISTS "Sales and admin can manage bookings" ON public.sales_bookings;
DROP POLICY IF EXISTS "Sales and accounts can manage bookings" ON public.sales_bookings;

CREATE POLICY "Sales and admin can manage bookings"
ON public.sales_bookings
FOR ALL
TO authenticated
USING (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'sales'])
)
WITH CHECK (
  has_any_department_type(auth.uid(), ARRAY['admin', 'finance', 'super_admin', 'sales'])
);