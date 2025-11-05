-- Drop the old contact_email column if it exists (cleanup from previous migrations)
ALTER TABLE public.external_partners 
DROP COLUMN IF EXISTS contact_email;

-- Also drop contact_name and contact_phone columns that were replaced by simpler names
ALTER TABLE public.external_partners 
DROP COLUMN IF EXISTS contact_name;

ALTER TABLE public.external_partners 
DROP COLUMN IF EXISTS contact_phone;

-- Rename contact_person to contact_person if not already correct
-- (ensuring consistency with the form field names)