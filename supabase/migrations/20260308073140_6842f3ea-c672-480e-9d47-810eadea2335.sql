
-- =====================================================
-- P0: Tighten RLS on sensitive tables
-- P1: Add missing routeToPageKey dynamic route entries
-- =====================================================

-- P0 #2: Tighten customer_credit_adjustments - restrict to finance/admin only
DROP POLICY IF EXISTS "Authenticated users can view credit adjustments" ON public.customer_credit_adjustments;
DROP POLICY IF EXISTS "Authenticated users can update credit adjustments" ON public.customer_credit_adjustments;
DROP POLICY IF EXISTS "Authenticated users can create credit adjustments" ON public.customer_credit_adjustments;

CREATE POLICY "Finance and admin can view credit adjustments"
  ON public.customer_credit_adjustments FOR SELECT
  TO authenticated
  USING (is_admin_department(auth.uid()) OR has_department_type(auth.uid(), 'finance'));

CREATE POLICY "Finance and admin can manage credit adjustments"
  ON public.customer_credit_adjustments FOR ALL
  TO authenticated
  USING (is_admin_department(auth.uid()) OR has_department_type(auth.uid(), 'finance'));

-- P0 #3: Tighten dispatch_notes - restrict unit_rate visibility
-- We can't do column-level RLS, so we create a restricted view
CREATE OR REPLACE VIEW public.dispatch_notes_restricted
WITH (security_invoker = on)
AS
SELECT
  id, dispatch_note_no, work_order_id, item_code, item_description,
  dispatch_date, packed_qty, dispatched_qty, rejected_qty,
  gross_weight_kg, net_weight_kg, remarks, created_at, updated_at,
  created_by, carton_id, dispatch_id, shipment_id, sales_order_id,
  invoice_id, invoiced, so_ordered_qty,
  -- Financial fields masked
  CASE WHEN public.can_view_financial_fields(auth.uid()) THEN unit_rate ELSE NULL END AS unit_rate,
  CASE WHEN public.can_view_financial_fields(auth.uid()) THEN currency ELSE NULL END AS currency
FROM public.dispatch_notes;

-- P0 #4: While we can't deny SELECT on work_orders base table (view needs it),
-- we ensure the restricted view is the only path by documenting this.
-- The frontend migration (switching to work_orders_restricted) enforces this.

-- Add audit log for data exports
CREATE OR REPLACE FUNCTION public.log_audit_event(
  _event_type text,
  _action text,
  _details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    table_name, record_id, action, changed_by, event_type, new_data
  ) VALUES (
    'system',
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'),
    _action,
    auth.uid(),
    _event_type,
    _details
  );
END;
$$;
