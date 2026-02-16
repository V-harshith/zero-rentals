-- ============================================================================
-- Bulk Import Transaction Support - Idempotency and Atomic Operations
-- ============================================================================

-- Table to track idempotent operations for retry safety
CREATE TABLE IF NOT EXISTS bulk_import_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES bulk_import_jobs(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    operation_key TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    identifier TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Composite unique constraint for idempotency
    UNIQUE(job_id, operation_key)
);

-- Index for fast idempotency lookups
CREATE INDEX IF NOT EXISTS idx_bulk_import_idempotency_lookup
    ON bulk_import_idempotency(job_id, operation_key, status);

-- Index for operation type queries
CREATE INDEX IF NOT EXISTS idx_bulk_import_idempotency_type
    ON bulk_import_idempotency(job_id, operation_type, status);

-- Index for cleanup of old records
CREATE INDEX IF NOT EXISTS idx_bulk_import_idempotency_created
    ON bulk_import_idempotency(created_at);

-- Function to clean up old idempotency records (run periodically)
CREATE OR REPLACE FUNCTION cleanup_bulk_import_idempotency(p_days_old INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM bulk_import_idempotency
    WHERE created_at < NOW() - (p_days_old || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add columns to properties table for bulk import tracking
ALTER TABLE properties
    ADD COLUMN IF NOT EXISTS bulk_import_job_id UUID REFERENCES bulk_import_jobs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS bulk_import_psn TEXT;

-- Index for bulk import property lookups
CREATE INDEX IF NOT EXISTS idx_properties_bulk_import_job
    ON properties(bulk_import_job_id)
    WHERE bulk_import_job_id IS NOT NULL;

-- Function to get all properties created by a bulk import job
CREATE OR REPLACE FUNCTION get_bulk_import_properties(p_job_id UUID)
RETURNS TABLE (
    property_id UUID,
    psn TEXT,
    title TEXT,
    owner_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id AS property_id,
        p.bulk_import_psn AS psn,
        p.title,
        p.owner_id
    FROM properties p
    WHERE p.bulk_import_job_id = p_job_id
    ORDER BY p.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to rollback all properties for a job (database-level cleanup)
CREATE OR REPLACE FUNCTION rollback_bulk_import_properties(p_job_id UUID)
RETURNS TABLE (
    deleted_property_id UUID,
    psn TEXT,
    success BOOLEAN
) AS $$
DECLARE
    prop RECORD;
    delete_result BOOLEAN;
BEGIN
    FOR prop IN
        SELECT id, bulk_import_psn
        FROM properties
        WHERE bulk_import_job_id = p_job_id
    LOOP
        BEGIN
            DELETE FROM properties WHERE id = prop.id;
            delete_result := TRUE;
        EXCEPTION WHEN OTHERS THEN
            delete_result := FALSE;
        END;

        deleted_property_id := prop.id;
        psn := prop.bulk_import_psn;
        success := delete_result;

        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE bulk_import_idempotency IS 'Tracks idempotent operations for bulk import retry safety';
COMMENT ON FUNCTION cleanup_bulk_import_idempotency IS 'Removes old idempotency records to prevent table bloat';
COMMENT ON FUNCTION get_bulk_import_properties IS 'Returns all properties created by a specific bulk import job';
COMMENT ON FUNCTION rollback_bulk_import_properties IS 'Deletes all properties associated with a bulk import job';
