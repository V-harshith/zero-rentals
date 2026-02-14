-- ============================================================================
-- BULK UPLOAD TABLES
-- ============================================================================

-- Table to track Excel upload jobs
CREATE TABLE IF NOT EXISTS bulk_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    total_rows INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'cancelled')),
    errors JSONB DEFAULT '[]'::jsonb,
    credentials JSONB DEFAULT '[]'::jsonb, -- New owner credentials for download
    new_owners_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_bulk_uploads_admin ON bulk_uploads(admin_id);
CREATE INDEX IF NOT EXISTS idx_bulk_uploads_status ON bulk_uploads(status);
CREATE INDEX IF NOT EXISTS idx_bulk_uploads_created_at ON bulk_uploads(created_at DESC);

-- Table to stage images before assignment to properties
CREATE TABLE IF NOT EXISTS image_staging (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES users(id) ON DELETE CASCADE,
    upload_batch_id UUID REFERENCES bulk_uploads(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    extracted_psn TEXT NOT NULL, -- Extracted property serial number from filename
    storage_path TEXT NOT NULL, -- Path in Supabase storage (staging folder)
    file_size INTEGER,
    mime_type TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'failed', 'orphaned')),
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL, -- Set when assigned
    assigned_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for image staging
CREATE INDEX IF NOT EXISTS idx_image_staging_admin ON image_staging(admin_id);
CREATE INDEX IF NOT EXISTS idx_image_staging_psn ON image_staging(extracted_psn);
CREATE INDEX IF NOT EXISTS idx_image_staging_status ON image_staging(status);
CREATE INDEX IF NOT EXISTS idx_image_staging_batch ON image_staging(upload_batch_id);

-- ============================================================================
-- RLS POLICIES FOR BULK_UPLOADS
-- ============================================================================

ALTER TABLE bulk_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_staging ENABLE ROW LEVEL SECURITY;

-- Admins can view all bulk uploads
CREATE POLICY "Admins can view all bulk uploads" ON bulk_uploads
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
        )
    );

-- Admins can insert bulk uploads
CREATE POLICY "Admins can create bulk uploads" ON bulk_uploads
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
        )
    );

-- Admins can update bulk uploads
CREATE POLICY "Admins can update bulk uploads" ON bulk_uploads
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
        )
    );

-- Admins can delete bulk uploads
CREATE POLICY "Admins can delete bulk uploads" ON bulk_uploads
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
        )
    );

-- ============================================================================
-- RLS POLICIES FOR IMAGE_STAGING
-- ============================================================================

-- Admins can view all staged images
CREATE POLICY "Admins can view staged images" ON image_staging
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
        )
    );

-- Admins can insert staged images
CREATE POLICY "Admins can stage images" ON image_staging
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
        )
    );

-- Admins can update staged images
CREATE POLICY "Admins can update staged images" ON image_staging
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
        )
    );

-- Admins can delete staged images
CREATE POLICY "Admins can delete staged images" ON image_staging
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
        )
    );

-- ============================================================================
-- STORAGE BUCKET FOR STAGING
-- ============================================================================

-- Create staging bucket for temporary image storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-images-staging', 'property-images-staging', false)
ON CONFLICT (id) DO NOTHING;

-- Allow admins to upload to staging
CREATE POLICY "Admins can upload to staging" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'property-images-staging'
        AND EXISTS (
            SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
        )
    );

-- Allow admins to view staging
CREATE POLICY "Admins can view staging" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'property-images-staging'
        AND EXISTS (
            SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
        )
    );

-- Allow admins to delete from staging
CREATE POLICY "Admins can delete from staging" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'property-images-staging'
        AND EXISTS (
            SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
        )
    );
