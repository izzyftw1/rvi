-- Add storage policies for documents bucket to allow uploads

-- Allow authenticated users to upload files to the documents bucket
CREATE POLICY "Authenticated users can upload to documents bucket"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Allow authenticated users to read files from the documents bucket
CREATE POLICY "Authenticated users can read from documents bucket"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'documents');

-- Allow authenticated users to update their uploaded files
CREATE POLICY "Authenticated users can update documents bucket files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'documents')
WITH CHECK (bucket_id = 'documents');

-- Allow authenticated users to delete their uploaded files
CREATE POLICY "Authenticated users can delete from documents bucket"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'documents');