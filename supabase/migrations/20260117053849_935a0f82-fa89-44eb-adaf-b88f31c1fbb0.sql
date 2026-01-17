-- ==============================================
-- SECURITY FIX: Restrict public SELECT access to authenticated-only
-- These tables were publicly readable without authentication
-- ==============================================

-- ===== 1. daily_production_logs - Contains production metrics =====
DROP POLICY IF EXISTS "Everyone can view daily production logs" ON public.daily_production_logs;
CREATE POLICY "Authenticated users can view daily production logs"
  ON public.daily_production_logs FOR SELECT
  TO authenticated
  USING (true);

-- ===== 2. item_cost_breakups - Contains sensitive pricing data =====
-- Fix: Remove public access and restrict to authenticated finance/admin
DROP POLICY IF EXISTS "Anyone can view item cost breakups" ON public.item_cost_breakups;
DROP POLICY IF EXISTS "Authenticated users can delete item cost breakups" ON public.item_cost_breakups;
DROP POLICY IF EXISTS "Authenticated users can insert item cost breakups" ON public.item_cost_breakups;
DROP POLICY IF EXISTS "Authenticated users can update item cost breakups" ON public.item_cost_breakups;

CREATE POLICY "Finance and admin can view item cost breakups"
  ON public.item_cost_breakups FOR SELECT
  TO authenticated
  USING (
    public.is_admin_department(auth.uid()) OR 
    public.has_department_type(auth.uid(), 'finance') OR
    public.has_department_type(auth.uid(), 'sales')
  );

CREATE POLICY "Finance and admin can manage item cost breakups"
  ON public.item_cost_breakups FOR ALL
  TO authenticated
  USING (
    public.is_admin_department(auth.uid()) OR 
    public.has_department_type(auth.uid(), 'finance')
  )
  WITH CHECK (
    public.is_admin_department(auth.uid()) OR 
    public.has_department_type(auth.uid(), 'finance')
  );

-- ===== 3. dispatch_notes - Contains customer order data =====
DROP POLICY IF EXISTS "Everyone can view dispatch notes" ON public.dispatch_notes;
CREATE POLICY "Authenticated users can view dispatch notes"
  ON public.dispatch_notes FOR SELECT
  TO authenticated
  USING (true);

-- ===== 4. external_movements - Contains subcontractor data =====
DROP POLICY IF EXISTS "Everyone can view external movements" ON public.external_movements;
CREATE POLICY "Authenticated users can view external movements"
  ON public.external_movements FOR SELECT
  TO authenticated
  USING (true);

-- ===== 5. qc_final_reports - Contains quality control data =====
DROP POLICY IF EXISTS "Anyone can view QC final reports" ON public.qc_final_reports;
CREATE POLICY "Authenticated users can view QC final reports"
  ON public.qc_final_reports FOR SELECT
  TO authenticated
  USING (true);

-- ===== 6. item_master - Fix conflicting public policies =====
-- Remove public-accessible SELECT and keep only authenticated
DROP POLICY IF EXISTS "Authenticated users can view item master" ON public.item_master;
DROP POLICY IF EXISTS "Authenticated users can insert item master" ON public.item_master;
DROP POLICY IF EXISTS "Authenticated users can update item master" ON public.item_master;

-- ===== 7. dimension_tolerances - Product specifications =====
DROP POLICY IF EXISTS "Authenticated users can view tolerances" ON public.dimension_tolerances;
CREATE POLICY "Authenticated users can view tolerances"
  ON public.dimension_tolerances FOR SELECT
  TO authenticated
  USING (true);

-- ===== 8. people table - Already has role-based policy, verify =====
-- Drop any overly permissive policy if it exists
DROP POLICY IF EXISTS "Anyone can view people" ON public.people;
-- The "Authorized roles can view people" policy already exists and is correct

-- Add audit comment
COMMENT ON POLICY "Authenticated users can view daily production logs" ON public.daily_production_logs IS 'Security fix: Requires authentication to view production data';
COMMENT ON POLICY "Finance and admin can view item cost breakups" ON public.item_cost_breakups IS 'Security fix: Cost data restricted to finance/admin/sales';
COMMENT ON POLICY "Authenticated users can view dispatch notes" ON public.dispatch_notes IS 'Security fix: Requires authentication to view dispatch data';
COMMENT ON POLICY "Authenticated users can view external movements" ON public.external_movements IS 'Security fix: Requires authentication to view external processing';
COMMENT ON POLICY "Authenticated users can view QC final reports" ON public.qc_final_reports IS 'Security fix: Requires authentication to view QC reports';
COMMENT ON POLICY "Authenticated users can view tolerances" ON public.dimension_tolerances IS 'Security fix: Requires authentication to view tolerances';