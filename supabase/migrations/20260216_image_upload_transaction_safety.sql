-- ============================================================================
-- Image Upload Transaction Safety
-- Tracks pending uploads and orphaned files for cleanup
-- ============================================================================

-- Table to track image uploads for transaction safety
CREATE TABLE IF NOT EXISTS property_image_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    public_url TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'orphaned')),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,

    -- Unique constraint to prevent duplicate uploads for same file
    UNIQUE(property_id, file_name)
);

-- Index for pending uploads
CREATE INDEX IF NOT EXISTS idx_property_image_uploads_pending
    ON property_image_uploads(status, uploaded_at)
    WHERE status = 'pending';

-- Index for orphaned files cleanup
CREATE INDEX IF NOT EXISTS idx_property_image_uploads_orphaned
    ON property_image_uploads(status, uploaded_at)
    WHERE status IN ('orphaned', 'failed');

-- Index for property lookups
CREATE INDEX IF NOT EXISTS idx_property_image_uploads_property
    ON property_image_uploads(property_id, status);

-- Index for owner lookups
CREATE INDEX IF NOT EXISTS idx_property_image_uploads_owner
    ON property_image_uploads(owner_id, uploaded_at);

-- Function to mark upload as completed
CREATE OR REPLACE FUNCTION mark_image_upload_completed(
    p_upload_id UUID,
    p_property_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE property_image_uploads
    SET status = 'completed',
        completed_at = NOW()
    WHERE id = p_upload_id
      AND property_id = p_property_id
      AND status = 'pending';

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark upload as failed
CREATE OR REPLACE FUNCTION mark_image_upload_failed(
    p_upload_id UUID,
    p_error_message TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE property_image_uploads
    SET status = 'failed',
        error_message = p_error_message
    WHERE id = p_upload_id
      AND status = 'pending';

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark pending uploads as orphaned (when property update fails)
CREATE OR REPLACE FUNCTION mark_orphaned_uploads(
    p_property_id UUID,
    p_upload_ids UUID[]
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE property_image_uploads
    SET status = 'orphaned'
    WHERE property_id = p_property_id
      AND id = ANY(p_upload_ids)
      AND status = 'pending';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get orphaned files for cleanup
CREATE OR REPLACE FUNCTION get_orphaned_uploads(
    p_older_than_minutes INTEGER DEFAULT 30
)
RETURNS TABLE (
    id UUID,
    property_id UUID,
    storage_path TEXT,
    public_url TEXT,
    uploaded_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        piu.id,
        piu.property_id,
        piu.storage_path,
        piu.public_url,
        piu.uploaded_at
    FROM property_image_uploads piu
    WHERE piu.status IN ('orphaned', 'failed')
       OR (piu.status = 'pending' AND piu.uploaded_at < NOW() - (p_older_than_minutes || ' minutes')::INTERVAL)
    ORDER BY piu.uploaded_at ASC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to delete upload record after storage cleanup
CREATE OR REPLACE FUNCTION delete_upload_record(p_upload_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    DELETE FROM property_image_uploads WHERE id = p_upload_id;
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old completed upload records (keep for 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_upload_records(p_days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM property_image_uploads
    WHERE status = 'completed'
      AND completed_at < NOW() - (p_days_old || ' days')::INTERVAL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS
ALTER TABLE property_image_uploads ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Owners can view their own uploads"
ON property_image_uploads FOR SELECT
USING (owner_id = auth.uid());

CREATE POLICY "Admins can view all uploads"
ON property_image_uploads FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
);

CREATE POLICY "Owners can insert their own uploads"
ON property_image_uploads FOR INSERT
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "System can update uploads"
ON property_image_uploads FOR UPDATE
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

-- Comments
COMMENT ON TABLE property_image_uploads IS 'Tracks property image uploads for transaction safety and orphaned file cleanup';
COMMENT ON FUNCTION mark_image_upload_completed IS 'Marks an image upload as successfully completed';
COMMENT ON FUNCTION mark_image_upload_failed IS 'Marks an image upload as failed with error message';
COMMENT ON FUNCTION mark_orphaned_uploads IS 'Marks pending uploads as orphaned when property update fails';
COMMENT ON FUNCTION get_orphaned_uploads IS 'Returns orphaned/failed uploads for cleanup job';
COMMENT ON FUNCTION cleanup_old_upload_records IS 'Removes old completed upload records to prevent table bloat';
