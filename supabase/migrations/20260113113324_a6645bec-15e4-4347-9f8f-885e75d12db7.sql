-- Add super_admin to the department_type enum
ALTER TYPE public.department_type ADD VALUE IF NOT EXISTS 'super_admin';