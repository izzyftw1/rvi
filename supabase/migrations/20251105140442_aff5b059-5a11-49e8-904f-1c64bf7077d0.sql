-- Add email column to external_partners table
ALTER TABLE public.external_partners 
ADD COLUMN IF NOT EXISTS email text;