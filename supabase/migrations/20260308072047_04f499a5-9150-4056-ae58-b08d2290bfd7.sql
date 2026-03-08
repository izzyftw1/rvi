
-- =====================================================
-- ENTERPRISE RBAC: DB-Level Data Masking, Audit, Reauth
-- =====================================================

-- 1. Security-definer function to get current user's department type
CREATE OR REPLACE FUNCTION public.get_user_department_type(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.type::text
  FROM public.profiles p
  JOIN public.departments d ON p.department_id = d.id
  WHERE p.id = _user_id
  LIMIT 1
$$;

-- 2. Function to check if user can see customer names
CREATE OR REPLACE FUNCTION public.can_view_customer_name(_user_id uuid)
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
      AND d.type IN ('admin', 'super_admin', 'finance', 'sales')
  )
$$;

-- 3. Function to check if user can see financial fields
CREATE OR REPLACE FUNCTION public.can_view_financial_fields(_user_id uuid)
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
      AND d.type IN ('admin', 'super_admin', 'finance')
  )
$$;

-- 4. Rebuild work_orders_restricted view WITH data masking
DROP VIEW IF EXISTS public.work_orders_restricted;
CREATE VIEW public.work_orders_restricted
WITH (security_invoker = on)
AS
SELECT
  id, 
  CASE WHEN public.can_view_customer_name(auth.uid()) THEN customer ELSE NULL END AS customer,
  item_code, revision, bom, quantity, due_date, sales_order, status,
  created_at, updated_at, so_id, production_allowed, dispatch_allowed,
  current_stage, gross_weight_per_pc, net_weight_per_pc, material_size_mm,
  customer_po, display_id, wo_id, cycle_time_seconds,
  qc_material_passed, qc_first_piece_passed,
  qc_material_approved_by, qc_material_approved_at,
  qc_first_piece_approved_by, qc_first_piece_approved_at,
  -- Financial fields masked
  CASE WHEN public.can_view_financial_fields(auth.uid()) THEN financial_snapshot ELSE NULL END AS financial_snapshot,
  CASE WHEN public.can_view_financial_fields(auth.uid()) THEN hidden_financial ELSE NULL END AS hidden_financial,
  site_id, qc_material_status, qc_first_piece_status,
  qc_material_remarks, qc_first_piece_remarks, priority,
  CASE WHEN public.can_view_customer_name(auth.uid()) THEN customer_id ELSE NULL END AS customer_id,
  cutting_required, forging_required, forging_vendor, wo_number,
  production_start, production_end, actual_cycle_time_hours,
  external_status, qty_external_wip, external_process_type,
  ready_for_dispatch, material_location, qc_status, production_locked,
  qc_raw_material_status, qc_raw_material_approved_at,
  qc_raw_material_approved_by, qc_raw_material_remarks,
  qc_final_status, qc_final_approved_at, qc_final_approved_by,
  qc_final_remarks, production_release_status, production_release_date,
  production_released_by, production_release_notes,
  quality_released, quality_released_at, quality_released_by,
  sampling_plan_reference, final_qc_result, traceability_frozen,
  qty_completed, qty_rejected, completion_pct, qty_dispatched,
  production_complete, production_complete_qty, production_completed_at,
  production_completed_by, production_complete_reason,
  material_requirement_id, qty_remaining
FROM public.work_orders;

-- 5. Audit log table enhancement (add structured event types)
DO $$
BEGIN
  -- Add event_type column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'event_type'
  ) THEN
    ALTER TABLE public.audit_logs ADD COLUMN event_type text;
  END IF;
  
  -- Add ip_address column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'ip_address'
  ) THEN
    ALTER TABLE public.audit_logs ADD COLUMN ip_address text;
  END IF;
END $$;

-- 6. Trigger: Log department (role) changes on profiles
CREATE OR REPLACE FUNCTION public.trg_audit_department_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.department_id IS DISTINCT FROM NEW.department_id THEN
    INSERT INTO public.audit_logs (
      table_name, record_id, action, changed_by, old_data, new_data, event_type
    ) VALUES (
      'profiles', NEW.id, 'DEPARTMENT_CHANGE', auth.uid(),
      jsonb_build_object('department_id', OLD.department_id),
      jsonb_build_object('department_id', NEW.department_id),
      'role_change'
    );
    
    -- Force reauth: set a marker timestamp
    NEW.updated_at = now();
  END IF;
  
  IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    INSERT INTO public.audit_logs (
      table_name, record_id, action, changed_by, old_data, new_data, event_type
    ) VALUES (
      'profiles', NEW.id, 'ACTIVE_STATUS_CHANGE', auth.uid(),
      jsonb_build_object('is_active', OLD.is_active),
      jsonb_build_object('is_active', NEW.is_active),
      'access_change'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_department_change ON public.profiles;
CREATE TRIGGER trg_audit_department_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_department_change();

-- 7. Trigger: Log permission override changes  
CREATE OR REPLACE FUNCTION public.trg_audit_permission_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (
      table_name, record_id, action, changed_by, new_data, event_type
    ) VALUES (
      'user_permission_overrides', NEW.id, 'PERMISSION_GRANTED', auth.uid(),
      to_jsonb(NEW), 'permission_change'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (
      table_name, record_id, action, changed_by, old_data, new_data, event_type
    ) VALUES (
      'user_permission_overrides', NEW.id, 'PERMISSION_UPDATED', auth.uid(),
      to_jsonb(OLD), to_jsonb(NEW), 'permission_change'
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (
      table_name, record_id, action, changed_by, old_data, event_type
    ) VALUES (
      'user_permission_overrides', OLD.id, 'PERMISSION_REVOKED', auth.uid(),
      to_jsonb(OLD), 'permission_change'
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_permission_change ON public.user_permission_overrides;
CREATE TRIGGER trg_audit_permission_change
  AFTER INSERT OR UPDATE OR DELETE ON public.user_permission_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_permission_change();

-- 8. Add missing department_defaults for Sales (all modules except finance)
INSERT INTO public.department_defaults (department_type, page_key, can_view, can_access_route, can_mutate)
VALUES
  -- Sales gets logistics visibility
  ('sales', 'logistics-dashboard', true, true, false),
  ('sales', 'gate-register', true, true, false),
  ('sales', 'packing', true, true, false),
  -- Sales gets quality view
  ('sales', 'quality-dashboard', true, true, false),
  ('sales', 'ncr', true, true, false),
  ('sales', 'traceability', true, true, false),
  -- Sales gets production view
  ('sales', 'production-progress', true, true, false),
  ('sales', 'daily-production-log', true, true, false),
  -- Home dashboard access 
  ('admin', 'home-dashboard', true, true, true),
  ('finance', 'home-dashboard', true, true, true),
  ('sales', 'home-dashboard', false, false, false),
  ('production', 'home-dashboard', false, false, false),
  ('quality', 'home-dashboard', false, false, false),
  ('packing', 'home-dashboard', false, false, false),
  ('design', 'home-dashboard', false, false, false),
  ('hr', 'home-dashboard', false, false, false),
  -- Production gets quality view pages
  ('production', 'quality-dashboard', true, true, false),
  ('production', 'ncr', true, true, false),
  ('production', 'traceability', true, true, false),
  -- Production gets logistics view
  ('production', 'logistics-dashboard', true, true, false),
  ('production', 'finished-goods', true, true, false),
  ('production', 'packing', true, true, false),
  ('production', 'dispatch', true, true, false),
  -- Quality gets dispatch-qc
  ('quality', 'dispatch-qc', true, true, true),
  -- Packing gets dispatch-qc view
  ('packing', 'dispatch-qc', true, true, false)
ON CONFLICT DO NOTHING;

-- 9. Create action_permissions table for approve/release/edit granularity
CREATE TABLE IF NOT EXISTS public.action_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_type text NOT NULL,
  action_key text NOT NULL, -- e.g. 'approve_qc', 'release_production', 'export_data', 'edit_wo'
  allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(department_type, action_key)
);

ALTER TABLE public.action_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read action permissions"
  ON public.action_permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can manage action permissions"
  ON public.action_permissions FOR ALL
  TO authenticated
  USING (is_admin_user(auth.uid()));

-- 10. Seed action permissions
INSERT INTO public.action_permissions (department_type, action_key, allowed)
VALUES
  -- Admin: everything
  ('admin', 'approve_qc', true), ('admin', 'release_production', true),
  ('admin', 'export_data', true), ('admin', 'edit_wo', true),
  ('admin', 'approve_dispatch', true), ('admin', 'create_invoice', true),
  ('admin', 'waive_qc', true), ('admin', 'close_ncr', true),
  -- Finance
  ('finance', 'approve_qc', false), ('finance', 'release_production', false),
  ('finance', 'export_data', true), ('finance', 'edit_wo', false),
  ('finance', 'approve_dispatch', true), ('finance', 'create_invoice', true),
  ('finance', 'waive_qc', false), ('finance', 'close_ncr', false),
  -- Sales
  ('sales', 'approve_qc', false), ('sales', 'release_production', false),
  ('sales', 'export_data', true), ('sales', 'edit_wo', false),
  ('sales', 'approve_dispatch', false), ('sales', 'create_invoice', false),
  ('sales', 'waive_qc', false), ('sales', 'close_ncr', false),
  -- Production
  ('production', 'approve_qc', false), ('production', 'release_production', true),
  ('production', 'export_data', false), ('production', 'edit_wo', true),
  ('production', 'approve_dispatch', false), ('production', 'create_invoice', false),
  ('production', 'waive_qc', false), ('production', 'close_ncr', false),
  -- Quality
  ('quality', 'approve_qc', true), ('quality', 'release_production', false),
  ('quality', 'export_data', false), ('quality', 'edit_wo', false),
  ('quality', 'approve_dispatch', false), ('quality', 'create_invoice', false),
  ('quality', 'waive_qc', true), ('quality', 'close_ncr', true),
  -- Packing
  ('packing', 'approve_qc', false), ('packing', 'release_production', false),
  ('packing', 'export_data', false), ('packing', 'edit_wo', false),
  ('packing', 'approve_dispatch', true), ('packing', 'create_invoice', false),
  ('packing', 'waive_qc', false), ('packing', 'close_ncr', false)
ON CONFLICT (department_type, action_key) DO NOTHING;

-- 11. Security definer function for action permission check
CREATE OR REPLACE FUNCTION public.can_perform_action(_user_id uuid, _action_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT ap.allowed
     FROM public.action_permissions ap
     JOIN public.departments d ON ap.department_type = d.type::text
     JOIN public.profiles p ON p.department_id = d.id
     WHERE p.id = _user_id AND ap.action_key = _action_key
     LIMIT 1),
    false
  )
$$;

-- 12. Index for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON public.audit_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_at ON public.audit_logs (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON public.audit_logs (record_id);
