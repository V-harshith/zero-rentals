-- ============================================================================
-- Property Concurrent Edit Protection - Database-Level Locks
-- ============================================================================
-- Replaces in-memory approvalLocks with distributed locks that work across
-- Vercel serverless instances.
--
-- Features:
-- - Advisory lock mechanism using a dedicated locks table
-- - Automatic lock expiration (timeout mechanism)
-- - Lock ownership tracking (which admin holds the lock)
-- - Cleanup of expired locks
-- ============================================================================

-- =============================================
-- TABLE: Property Locks
-- =============================================
CREATE TABLE IF NOT EXISTS property_locks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lock_type TEXT NOT NULL DEFAULT 'edit',
    acquired_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    session_id TEXT, -- Optional: for tracking client sessions

    -- Each property can only have one active lock at a time
    UNIQUE(property_id, lock_type)
);

-- Indexes for efficient lock queries
CREATE INDEX IF NOT EXISTS idx_property_locks_property_id ON property_locks(property_id);
CREATE INDEX IF NOT EXISTS idx_property_locks_admin_id ON property_locks(admin_id);
CREATE INDEX IF NOT EXISTS idx_property_locks_expires_at ON property_locks(expires_at);
CREATE INDEX IF NOT EXISTS idx_property_locks_active ON property_locks(property_id, lock_type, expires_at)
    WHERE expires_at > NOW();

-- Enable RLS on locks table
ALTER TABLE property_locks ENABLE ROW LEVEL SECURITY;

-- Only admins can view locks (for debugging/monitoring)
CREATE POLICY "Admins can view property locks" ON property_locks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Only the lock system can modify locks
CREATE POLICY "System can manage property locks" ON property_locks
    FOR ALL WITH CHECK (true);

-- =============================================
-- FUNCTION: Acquire Property Lock
-- =============================================
-- Attempts to acquire a lock on a property.
-- Returns JSON with success status and lock details.
-- If lock is already held by another admin, returns failure with holder info.
-- =============================================
CREATE OR REPLACE FUNCTION acquire_property_lock(
    p_property_id UUID,
    p_admin_id UUID,
    p_lock_type TEXT DEFAULT 'edit',
    p_timeout_seconds INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_lock RECORD;
    v_lock_id UUID;
    v_expires_at TIMESTAMP WITH TIME ZONE;
    v_result JSONB;
BEGIN
    -- Input validation
    IF p_property_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Property ID is required'
        );
    END IF;

    IF p_admin_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Admin ID is required'
        );
    END IF;

    IF p_timeout_seconds <= 0 OR p_timeout_seconds > 300 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Timeout must be between 1 and 300 seconds'
        );
    END IF;

    -- First, clean up any expired locks for this property
    DELETE FROM property_locks
    WHERE property_id = p_property_id
    AND lock_type = p_lock_type
    AND expires_at <= NOW();

    -- Check if property exists
    IF NOT EXISTS (SELECT 1 FROM properties WHERE id = p_property_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Property not found'
        );
    END IF;

    -- Check for existing active lock
    SELECT * INTO v_existing_lock
    FROM property_locks
    WHERE property_id = p_property_id
    AND lock_type = p_lock_type
    AND expires_at > NOW();

    IF v_existing_lock IS NOT NULL THEN
        -- Lock is held by someone else
        IF v_existing_lock.admin_id != p_admin_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Property is currently being processed by another admin',
                'locked_by_admin_id', v_existing_lock.admin_id,
                'locked_at', v_existing_lock.acquired_at,
                'expires_at', v_existing_lock.expires_at,
                'seconds_remaining', EXTRACT(EPOCH FROM (v_existing_lock.expires_at - NOW()))::INTEGER
            );
        ELSE
            -- Same admin already holds the lock - extend it
            UPDATE property_locks
            SET expires_at = NOW() + (p_timeout_seconds || ' seconds')::INTERVAL
            WHERE id = v_existing_lock.id
            RETURNING expires_at INTO v_expires_at;

            RETURN jsonb_build_object(
                'success', true,
                'message', 'Lock extended',
                'property_id', p_property_id,
                'admin_id', p_admin_id,
                'lock_type', p_lock_type,
                'expires_at', v_expires_at,
                'extended', true
            );
        END IF;
    END IF;

    -- Acquire new lock
    v_expires_at := NOW() + (p_timeout_seconds || ' seconds')::INTERVAL;

    INSERT INTO property_locks (
        property_id,
        admin_id,
        lock_type,
        acquired_at,
        expires_at
    ) VALUES (
        p_property_id,
        p_admin_id,
        p_lock_type,
        NOW(),
        v_expires_at
    )
    RETURNING id INTO v_lock_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Lock acquired successfully',
        'property_id', p_property_id,
        'admin_id', p_admin_id,
        'lock_type', p_lock_type,
        'lock_id', v_lock_id,
        'expires_at', v_expires_at,
        'timeout_seconds', p_timeout_seconds
    );

EXCEPTION
    WHEN unique_violation THEN
        -- Another transaction acquired the lock between our check and insert
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Property is currently being processed by another admin (concurrent acquisition)'
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Failed to acquire lock: ' || SQLERRM
        );
END;
$$;

-- =============================================
-- FUNCTION: Release Property Lock
-- =============================================
-- Releases a lock held by an admin.
-- Only the admin who acquired the lock can release it.
-- =============================================
CREATE OR REPLACE FUNCTION release_property_lock(
    p_property_id UUID,
    p_admin_id UUID,
    p_lock_type TEXT DEFAULT 'edit'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Input validation
    IF p_property_id IS NULL OR p_admin_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Property ID and Admin ID are required'
        );
    END IF;

    -- Delete the lock (only if held by this admin)
    DELETE FROM property_locks
    WHERE property_id = p_property_id
    AND admin_id = p_admin_id
    AND lock_type = p_lock_type;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count = 0 THEN
        -- Check if lock exists but is held by someone else
        IF EXISTS (
            SELECT 1 FROM property_locks
            WHERE property_id = p_property_id
            AND lock_type = p_lock_type
        ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Lock is held by a different admin',
                'released', false
            );
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'message', 'No active lock found (may have expired)',
            'released', false,
            'was_expired', true
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Lock released successfully',
        'property_id', p_property_id,
        'released', true
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Failed to release lock: ' || SQLERRM
        );
END;
$$;

-- =============================================
-- FUNCTION: Extend Property Lock
-- =============================================
-- Extends the expiration time of an existing lock.
-- Only the admin who acquired the lock can extend it.
-- =============================================
CREATE OR REPLACE FUNCTION extend_property_lock(
    p_property_id UUID,
    p_admin_id UUID,
    p_lock_type TEXT DEFAULT 'edit',
    p_additional_seconds INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_lock RECORD;
    v_new_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Input validation
    IF p_property_id IS NULL OR p_admin_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Property ID and Admin ID are required'
        );
    END IF;

    IF p_additional_seconds <= 0 OR p_additional_seconds > 300 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Additional time must be between 1 and 300 seconds'
        );
    END IF;

    -- Find existing lock
    SELECT * INTO v_existing_lock
    FROM property_locks
    WHERE property_id = p_property_id
    AND lock_type = p_lock_type;

    IF v_existing_lock IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No active lock found for this property',
            'extended', false
        );
    END IF;

    -- Check if lock is held by this admin
    IF v_existing_lock.admin_id != p_admin_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Lock is held by a different admin',
            'locked_by', v_existing_lock.admin_id,
            'extended', false
        );
    END IF;

    -- Check if lock has expired
    IF v_existing_lock.expires_at <= NOW() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Lock has expired - acquire a new lock',
            'expired_at', v_existing_lock.expires_at,
            'extended', false
        );
    END IF;

    -- Extend the lock
    v_new_expires_at := v_existing_lock.expires_at + (p_additional_seconds || ' seconds')::INTERVAL;

    UPDATE property_locks
    SET expires_at = v_new_expires_at
    WHERE id = v_existing_lock.id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Lock extended successfully',
        'property_id', p_property_id,
        'previous_expires_at', v_existing_lock.expires_at,
        'new_expires_at', v_new_expires_at,
        'extended_by_seconds', p_additional_seconds,
        'extended', true
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Failed to extend lock: ' || SQLERRM
        );
END;
$$;

-- =============================================
-- FUNCTION: Cleanup Expired Locks
-- =============================================
-- Removes all expired locks from the table.
-- Should be called periodically (e.g., via a cron job).
-- =============================================
CREATE OR REPLACE FUNCTION cleanup_expired_locks()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM property_locks
    WHERE expires_at <= NOW();

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN v_deleted_count;
END;
$$;

-- =============================================
-- FUNCTION: Get Property Lock Status
-- =============================================
-- Returns the current lock status for a property.
-- Useful for checking if a property is locked before attempting operations.
-- =============================================
CREATE OR REPLACE FUNCTION get_property_lock_status(
    p_property_id UUID,
    p_lock_type TEXT DEFAULT 'edit'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lock RECORD;
BEGIN
    IF p_property_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Property ID is required'
        );
    END IF;

    SELECT * INTO v_lock
    FROM property_locks
    WHERE property_id = p_property_id
    AND lock_type = p_lock_type;

    IF v_lock IS NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'locked', false,
            'property_id', p_property_id,
            'message', 'No lock found'
        );
    END IF;

    IF v_lock.expires_at <= NOW() THEN
        RETURN jsonb_build_object(
            'success', true,
            'locked', false,
            'expired', true,
            'property_id', p_property_id,
            'expired_at', v_lock.expires_at,
            'message', 'Lock has expired'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'locked', true,
        'property_id', p_property_id,
        'locked_by_admin_id', v_lock.admin_id,
        'locked_at', v_lock.acquired_at,
        'expires_at', v_lock.expires_at,
        'seconds_remaining', EXTRACT(EPOCH FROM (v_lock.expires_at - NOW()))::INTEGER,
        'message', 'Property is locked'
    );
END;
$$;

-- =============================================
-- GRANT PERMISSIONS
-- =============================================
GRANT EXECUTE ON FUNCTION acquire_property_lock(UUID, UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION release_property_lock(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION extend_property_lock(UUID, UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_locks() TO authenticated;
GRANT EXECUTE ON FUNCTION get_property_lock_status(UUID, TEXT) TO authenticated;

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON TABLE property_locks IS 'Distributed locks for property edit operations';
COMMENT ON FUNCTION acquire_property_lock IS 'Attempts to acquire a distributed lock on a property';
COMMENT ON FUNCTION release_property_lock IS 'Releases a lock held by an admin';
COMMENT ON FUNCTION extend_property_lock IS 'Extends the expiration time of an existing lock';
COMMENT ON FUNCTION cleanup_expired_locks IS 'Removes all expired locks - run periodically via cron';
COMMENT ON FUNCTION get_property_lock_status IS 'Returns the current lock status for a property';
