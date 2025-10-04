-- Drop the problematic "FOR ALL" policy that's causing the RLS violation
DROP POLICY IF EXISTS "Managers can manage tolerances" ON public.dimension_tolerances;

-- Ensure we have proper individual policies (these were already created but confirming)
-- The INSERT, UPDATE, DELETE policies already exist from previous migration