-- Grant admin full access to sales orders
CREATE POLICY "Admins can manage sales orders"
ON public.sales_orders
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Grant admin full access to purchase orders
CREATE POLICY "Admins can manage purchase orders"
ON public.purchase_orders
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Grant admin full access to work orders
CREATE POLICY "Admins can manage work orders"
ON public.work_orders
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Grant admin full access to material lots
CREATE POLICY "Admins can manage material lots"
ON public.material_lots
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Grant admin full access to machines
CREATE POLICY "Admins can manage machines"
ON public.machines
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Grant admin full access to QC records
CREATE POLICY "Admins can manage QC records"
ON public.qc_records
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Grant admin full access to routing steps
CREATE POLICY "Admins can manage routing steps"
ON public.routing_steps
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Grant admin full access to cartons
CREATE POLICY "Admins can manage cartons"
ON public.cartons
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Grant admin full access to pallets
CREATE POLICY "Admins can manage pallets"
ON public.pallets
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Grant admin full access to shipments
CREATE POLICY "Admins can manage shipments"
ON public.shipments
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Grant admin full access to dimension tolerances
CREATE POLICY "Admins can manage dimension tolerances"
ON public.dimension_tolerances
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));