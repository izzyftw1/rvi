-- Add new role values to app_role enum
-- These must be in separate transactions from functions that use them
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'finance_admin';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'finance_user';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'ops_manager';