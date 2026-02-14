-- Create Storage Bucket for Property Images
-- Run this in Supabase SQL Editor or via Supabase Dashboard

-- Create the bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-images', 'property-images', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for property images

-- Allow anyone to view images (public bucket)
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'property-images');

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'property-images' 
  AND auth.role() = 'authenticated'
);

-- Allow users to update their own images
CREATE POLICY "Users can update own images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'property-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'property-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own images
CREATE POLICY "Users can delete own images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'property-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow admins to delete any images
CREATE POLICY "Admins can delete any images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'property-images' 
  AND EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'admin'
  )
);
