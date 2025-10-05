-- Fix 1: Remove the dangerous 'role' column from profiles table
-- This eliminates privilege escalation risk and data duplication

ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;

-- Fix 2: Restrict profile visibility to prevent employee enumeration
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

-- Create a restricted policy that only allows:
-- 1. Users to view their own profile
-- 2. CFO and Director roles to view all profiles (for management needs)
CREATE POLICY "Users can view own profile or admins can view all"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id OR
    has_role(auth.uid(), 'cfo'::app_role) OR
    has_role(auth.uid(), 'director'::app_role)
  );