-- Create helper function to check if user has finance role
CREATE OR REPLACE FUNCTION public.is_finance_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin'::app_role, 'finance_admin'::app_role, 'finance_user'::app_role, 'admin'::app_role, 'accounts'::app_role)
  )
$$;

-- Create view for non-finance users (financial fields are hidden)
CREATE OR REPLACE VIEW public.work_orders_restricted AS
SELECT 
  id,
  wo_id,
  display_id,
  customer,
  customer_po,
  item_code,
  revision,
  bom,
  quantity,
  due_date,
  sales_order,
  so_id,
  status,
  production_allowed,
  dispatch_allowed,
  current_stage,
  material_size_mm,
  cycle_time_seconds,
  qc_material_passed,
  qc_first_piece_passed,
  qc_material_approved_by,
  qc_material_approved_at,
  qc_first_piece_approved_by,
  qc_first_piece_approved_at,
  created_at,
  updated_at,
  -- Financial fields are NULL for non-finance users
  CASE WHEN is_finance_role(auth.uid()) THEN gross_weight_per_pc ELSE NULL END as gross_weight_per_pc,
  CASE WHEN is_finance_role(auth.uid()) THEN net_weight_per_pc ELSE NULL END as net_weight_per_pc,
  CASE WHEN is_finance_role(auth.uid()) THEN financial_snapshot ELSE NULL END as financial_snapshot,
  hidden_financial
FROM public.work_orders;

-- Grant access to the restricted view
GRANT SELECT ON public.work_orders_restricted TO authenticated;