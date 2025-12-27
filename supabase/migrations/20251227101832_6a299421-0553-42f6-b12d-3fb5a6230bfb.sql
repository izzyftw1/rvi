-- Create a public bucket for company assets like logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('company-assets', 'company-assets', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Public read access for company assets"
ON storage.objects
FOR SELECT
USING (bucket_id = 'company-assets');

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload company assets"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'company-assets' AND auth.role() = 'authenticated');