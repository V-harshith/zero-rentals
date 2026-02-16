-- ============================================================================
-- Bulk Import Concurrency Control - Database Enhancements
-- ============================================================================

-- Add index for faster concurrent job detection
CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_admin_processing
    ON bulk_import_jobs(admin_id, status)
    WHERE status IN ('processing', 'parsing_excel', 'uploading_images');

-- Add index for rate limiting queries (jobs created in last minute)
CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_created_at
    ON bulk_import_jobs(admin_id, created_at);

-- Add composite index for job status queries
CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_admin_status
    ON bulk_import_jobs(admin_id, status, created_at);

-- Function to check if admin has processing job (for use in RLS or triggers)
CREATE OR REPLACE FUNCTION admin_has_processing_job(p_admin_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    has_job BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM bulk_import_jobs
        WHERE admin_id = p_admin_id
        AND status IN ('processing', 'parsing_excel', 'uploading_images')
        AND (processing_started_at IS NULL
             OR processing_started_at > NOW() - INTERVAL '5 minutes')
    ) INTO has_job;

    RETURN has_job;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get admin's active job count
CREATE OR REPLACE FUNCTION get_admin_active_job_count(p_admin_id UUID)
RETURNS INTEGER AS $$
DECLARE
    job_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO job_count
    FROM bulk_import_jobs
    WHERE admin_id = p_admin_id
    AND status IN ('created', 'parsing_excel', 'excel_parsed', 'uploading_images', 'images_uploaded', 'ready', 'processing');

    RETURN job_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to automatically mark stale jobs as failed
CREATE OR REPLACE FUNCTION cleanup_stale_processing_jobs()
RETURNS INTEGER AS $$
DECLARE
    stale_count INTEGER;
BEGIN
    UPDATE bulk_import_jobs
    SET
        status = 'failed',
        error_message = 'Job timed out - processing took too long (auto-cleanup)',
        error_details = jsonb_build_object(
            'previous_status', status,
            'processing_started_at', processing_started_at,
            'timeout_threshold_minutes', 5
        )
    WHERE status IN ('processing', 'parsing_excel', 'uploading_images')
    AND processing_started_at < NOW() - INTERVAL '5 minutes';

    GET DIAGNOSTICS stale_count = ROW_COUNT;

    -- Log the cleanup
    IF stale_count > 0 THEN
        INSERT INTO bulk_import_audit_log (job_id, admin_id, action, details)
        SELECT
            id,
            admin_id,
            'job_timeout_auto_cleanup',
            jsonb_build_object('automated', true, 'previous_status', status)
        FROM bulk_import_jobs
        WHERE status = 'failed'
        AND error_message LIKE '%auto-cleanup%'
        AND created_at > NOW() - INTERVAL '1 minute';
    END IF;

    RETURN stale_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON FUNCTION admin_has_processing_job IS 'Checks if an admin has any job currently being processed';
COMMENT ON FUNCTION get_admin_active_job_count IS 'Returns the count of active jobs for an admin';
COMMENT ON FUNCTION cleanup_stale_processing_jobs IS 'Automatically marks jobs that have been processing for too long as failed';
