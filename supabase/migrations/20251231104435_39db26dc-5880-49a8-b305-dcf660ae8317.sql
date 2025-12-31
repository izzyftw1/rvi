-- Add 'supplier' to department_type enum
ALTER TYPE public.department_type ADD VALUE IF NOT EXISTS 'supplier';