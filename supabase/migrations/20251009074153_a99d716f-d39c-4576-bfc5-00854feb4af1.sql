-- Update RLS policies for raw_purchase_orders (PurchaseManager: create/approve, Stores: receive only)
DROP POLICY IF EXISTS "Admins can manage purchase orders" ON public.raw_purchase_orders;
DROP POLICY IF EXISTS "Purchase can manage purchase orders" ON public.raw_purchase_orders;
DROP POLICY IF EXISTS "Authenticated users can view purchase orders" ON public.raw_purchase_orders;

-- Purchase managers can create and approve RPOs
CREATE POLICY "Purchase managers can create RPOs"
ON public.raw_purchase_orders
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'purchase') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Purchase managers can update RPOs"
ON public.raw_purchase_orders
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'purchase') OR has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'purchase') OR has_role(auth.uid(), 'admin'));

-- Everyone can view RPOs
CREATE POLICY "Everyone can view RPOs"
ON public.raw_purchase_orders
FOR SELECT
TO authenticated
USING (true);

-- Admins can delete
CREATE POLICY "Admins can delete RPOs"
ON public.raw_purchase_orders
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Update RLS policies for raw_po_receipts (Stores can create, Purchase/Finance can view)
DROP POLICY IF EXISTS "Stores and purchase can manage receipts" ON public.raw_po_receipts;
DROP POLICY IF EXISTS "Authenticated users can view receipts" ON public.raw_po_receipts;

CREATE POLICY "Stores can create receipts"
ON public.raw_po_receipts
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'stores') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Everyone can view receipts"
ON public.raw_po_receipts
FOR SELECT
TO authenticated
USING (true);

-- Stores cannot update rates/supplier info after creation
CREATE POLICY "Stores can update receipts limited"
ON public.raw_po_receipts
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'stores') OR has_role(auth.uid(), 'purchase') OR has_role(auth.uid(), 'accounts') OR has_role(auth.uid(), 'admin'));

-- Update RLS policies for raw_po_reconciliations (Purchase and Finance can manage)
DROP POLICY IF EXISTS "Purchase and admin can manage reconciliations" ON public.raw_po_reconciliations;
DROP POLICY IF EXISTS "Authenticated users can view reconciliations" ON public.raw_po_reconciliations;

CREATE POLICY "Purchase and finance can create reconciliations"
ON public.raw_po_reconciliations
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'purchase') OR has_role(auth.uid(), 'accounts') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Purchase and finance can update reconciliations"
ON public.raw_po_reconciliations
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'purchase') OR has_role(auth.uid(), 'accounts') OR has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'purchase') OR has_role(auth.uid(), 'accounts') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Everyone can view reconciliations"
ON public.raw_po_reconciliations
FOR SELECT
TO authenticated
USING (true);

-- Update suppliers table RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Purchase can manage suppliers" ON public.suppliers;

CREATE POLICY "Everyone can view suppliers"
ON public.suppliers
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Purchase can manage suppliers"
ON public.suppliers
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'purchase') OR has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'purchase') OR has_role(auth.uid(), 'admin'));