-- ============================================================================
-- Unified Bulk Import System - Database Schema
-- ============================================================================

-- Main job tracking table for unified bulk import
CREATE TABLE IF NOT EXISTS bulk_import_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Job status tracking
    status TEXT NOT NULL DEFAULT 'created',
    -- 'created' -> 'parsing_excel' -> 'excel_parsed' -> 'uploading_images' -> 'images_uploaded' -> 'ready' -> 'processing' -> 'completed' | 'failed' | 'cancelled'

    step TEXT DEFAULT 'created',
    -- 'created', 'excel_upload', 'image_upload', 'review', 'processing', 'completed', 'failed', 'cancelled'

    -- Excel data
    excel_file_name TEXT,
    excel_file_size INTEGER,
    total_properties INTEGER DEFAULT 0,
    parsed_properties JSONB DEFAULT '[]'::jsonb,
    -- Each property: { psn, name, city, area, ownerEmail, ownerName, ownerPhone, propertyData: {} }

    -- Owner tracking
    new_owners JSONB DEFAULT '[]'::jsonb,
    -- { email, name, phone, password_encrypted, properties: [] }
    existing_owners_matched INTEGER DEFAULT 0,

    -- Image data
    total_images INTEGER DEFAULT 0,
    images_by_psn JSONB DEFAULT '{}'::jsonb,
    -- { "1053": [{ filename, storagePath, size }, ...], ... }
    orphaned_images JSONB DEFAULT '[]'::jsonb,
    -- Images that didn't match any PSN

    -- Processing results
    processed_properties INTEGER DEFAULT 0,
    failed_properties INTEGER DEFAULT 0,
    created_property_ids UUID[] DEFAULT '{}',
    created_owner_ids UUID[] DEFAULT '{}',
    failed_items JSONB DEFAULT '[]'::jsonb,
    -- [{ psn, error, step }]

    -- Credentials (encrypted with admin's session key)
    credentials_encrypted TEXT,

    -- Error tracking
    error_message TEXT,
    error_details JSONB,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    excel_uploaded_at TIMESTAMP WITH TIME ZONE,
    images_uploaded_at TIMESTAMP WITH TIME ZONE,
    processing_started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Auto-cleanup after 7 days
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days'
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_admin ON bulk_import_jobs(admin_id);
CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_status ON bulk_import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_step ON bulk_import_jobs(step);
CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_expires ON bulk_import_jobs(expires_at);

-- Image staging table for temporary storage during import
CREATE TABLE IF NOT EXISTS bulk_import_staged_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES bulk_import_jobs(id) ON DELETE CASCADE,

    filename TEXT NOT NULL,
    original_path TEXT, -- Full path from folder upload
    extracted_psn TEXT NOT NULL,

    storage_path TEXT, -- Path in Supabase Storage
    file_size INTEGER,
    mime_type TEXT,

    status TEXT DEFAULT 'pending',
    -- 'pending', 'uploaded', 'processing', 'assigned', 'failed', 'orphaned'

    error_message TEXT,
    processed_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staged_images_job ON bulk_import_staged_images(job_id);
CREATE INDEX IF NOT EXISTS idx_staged_images_psn ON bulk_import_staged_images(extracted_psn);
CREATE INDEX IF NOT EXISTS idx_staged_images_status ON bulk_import_staged_images(status);

-- Audit log for bulk imports
CREATE TABLE IF NOT EXISTS bulk_import_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES bulk_import_jobs(id) ON DELETE SET NULL,
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,

    action TEXT NOT NULL,
    -- 'job_created', 'excel_uploaded', 'images_uploaded', 'import_started', 'owner_created', 'property_created', 'image_assigned', 'import_completed', 'import_failed', 'job_cancelled'

    details JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_audit_job ON bulk_import_audit_log(job_id);
CREATE INDEX IF NOT EXISTS idx_import_audit_created ON bulk_import_audit_log(created_at);

-- Function to cleanup old jobs
CREATE OR REPLACE FUNCTION cleanup_old_bulk_import_jobs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete expired completed/failed/cancelled jobs
    DELETE FROM bulk_import_jobs
    WHERE expires_at < NOW()
      AND status IN ('completed', 'failed', 'cancelled');

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_bulk_import_job_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
DROP TRIGGER IF EXISTS trigger_update_bulk_import_job ON bulk_import_jobs;
CREATE TRIGGER trigger_update_bulk_import_job
    BEFORE UPDATE ON bulk_import_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_bulk_import_job_timestamp();

-- RLS Policies
ALTER TABLE bulk_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_import_staged_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_import_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can view their own jobs
CREATE POLICY "Admins can view their own import jobs"
    ON bulk_import_jobs FOR SELECT
    USING (admin_id = auth.uid() OR EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    ));

-- Admins can insert their own jobs
CREATE POLICY "Admins can create import jobs"
    ON bulk_import_jobs FOR INSERT
    WITH CHECK (admin_id = auth.uid());

-- Admins can update their own jobs
CREATE POLICY "Admins can update their own jobs"
    ON bulk_import_jobs FOR UPDATE
    USING (admin_id = auth.uid());

-- Admins can delete their own jobs
CREATE POLICY "Admins can delete their own jobs"
    ON bulk_import_jobs FOR DELETE
    USING (admin_id = auth.uid());

-- Staged images policies
CREATE POLICY "Admins can view staged images for their jobs"
    ON bulk_import_staged_images FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM bulk_import_jobs
        WHERE id = bulk_import_staged_images.job_id
        AND admin_id = auth.uid()
    ));

-- Audit log policies
CREATE POLICY "Admins can view audit logs for their jobs"
    ON bulk_import_audit_log FOR SELECT
    USING (admin_id = auth.uid());

-- Grant permissions to service role
GRANT ALL ON bulk_import_jobs TO service_role;
GRANT ALL ON bulk_import_staged_images TO service_role;
GRANT ALL ON bulk_import_audit_log TO service_role;

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE bulk_import_jobs IS 'Tracks unified bulk import jobs for Excel + Images import workflow';
COMMENT ON TABLE bulk_import_staged_images IS 'Temporary storage for images uploaded during bulk import process';
COMMENT ON TABLE bulk_import_audit_log IS 'Audit trail for all bulk import operations';

COMMENT ON COLUMN bulk_import_jobs.status IS 'Current status of the import job';
COMMENT ON COLUMN bulk_import_jobs.step IS 'Current UI step in the wizard';
COMMENT ON COLUMN bulk_import_jobs.parsed_properties IS 'Array of properties parsed from Excel with PSN for image matching';
COMMENT ON COLUMN bulk_import_jobs.images_by_psn IS 'JSON mapping PSN to array of image file paths';
COMMENT ON COLUMN bulk_import_jobs.credentials_encrypted IS 'Encrypted credentials for new owners (decryptable only during active session)';
