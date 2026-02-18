-- ============================================================================
-- ZERO RENTALS - COMPLETE PRODUCTION DATABASE FIX SCRIPT
-- Run this in Supabase SQL Editor to apply all missing database objects
-- ============================================================================
-- Version: 2026-02-18
-- Includes: All tables, functions, indexes, and constraints from recent migrations
-- ============================================================================

-- ============================================================================
-- STEP 1: DIAGNOSTIC - Check What Exists
-- ============================================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    RAISE NOTICE '=== ZERO RENTALS PRODUCTION DIAGNOSTIC ===';

    -- Check property_locks table
    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'property_locks';
    RAISE NOTICE 'property_locks table: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    -- Check bulk_import_idempotency table
    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'bulk_import_idempotency';
    RAISE NOTICE 'bulk_import_idempotency table: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    -- Check bulk_import_staged_images table
    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'bulk_import_staged_images';
    RAISE NOTICE 'bulk_import_staged_images table: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    -- Check property_image_uploads table
    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'property_image_uploads';
    RAISE NOTICE 'property_image_uploads table: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    -- Check property_status_transitions table
    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'property_status_transitions';
    RAISE NOTICE 'property_status_transitions table: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    -- Check payment_logs.order_id column
    SELECT COUNT(*) INTO v_count FROM information_schema.columns WHERE table_name = 'payment_logs' AND column_name = 'order_id';
    RAISE NOTICE 'payment_logs.order_id column: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    -- Check properties.bulk_import_job_id column
    SELECT COUNT(*) INTO v_count FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'bulk_import_job_id';
    RAISE NOTICE 'properties.bulk_import_job_id column: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    -- Check functions
    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'acquire_property_lock';
    RAISE NOTICE 'acquire_property_lock function: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'release_property_lock';
    RAISE NOTICE 'release_property_lock function: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'extend_property_lock';
    RAISE NOTICE 'extend_property_lock function: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'transition_property_status';
    RAISE NOTICE 'transition_property_status function: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'set_property_featured';
    RAISE NOTICE 'set_property_featured function: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'bulk_transition_property_status';
    RAISE NOTICE 'bulk_transition_property_status function: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'get_property_status_history';
    RAISE NOTICE 'get_property_status_history function: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'rollback_bulk_import_properties';
    RAISE NOTICE 'rollback_bulk_import_properties function: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'mark_image_upload_failed';
    RAISE NOTICE 'mark_image_upload_failed function: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'mark_orphaned_uploads';
    RAISE NOTICE 'mark_orphaned_uploads function: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'cleanup_expired_locks';
    RAISE NOTICE 'cleanup_expired_locks function: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'get_property_lock_status';
    RAISE NOTICE 'get_property_lock_status function: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    RAISE NOTICE '=== END DIAGNOSTIC ===';
END $$;

-- ============================================================================
-- STEP 2: FIXES - Create Missing Objects
-- ============================================================================

-- =============================================
-- FIX 1: Property Locks Table & Functions
-- =============================================
CREATE TABLE IF NOT EXISTS property_locks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lock_type TEXT NOT NULL DEFAULT 'edit',
    acquired_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    session_id TEXT,
    UNIQUE(property_id, lock_type)
);

CREATE INDEX IF NOT EXISTS idx_property_locks_property_id ON property_locks(property_id);
CREATE INDEX IF NOT EXISTS idx_property_locks_admin_id ON property_locks(admin_id);
CREATE INDEX IF NOT EXISTS idx_property_locks_expires_at ON property_locks(expires_at);
CREATE INDEX IF NOT EXISTS idx_property_locks_active ON property_locks(property_id, lock_type, expires_at)
    WHERE expires_at > NOW();

ALTER TABLE property_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view property locks" ON property_locks;
CREATE POLICY "Admins can view property locks" ON property_locks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "System can manage property locks" ON property_locks;
CREATE POLICY "System can manage property locks" ON property_locks
    FOR ALL WITH CHECK (true);

-- acquire_property_lock function
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
BEGIN
    IF p_property_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Property ID is required');
    END IF;

    IF p_admin_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Admin ID is required');
    END IF;

    IF p_timeout_seconds <= 0 OR p_timeout_seconds > 300 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Timeout must be between 1 and 300 seconds');
    END IF;

    DELETE FROM property_locks
    WHERE property_id = p_property_id
    AND lock_type = p_lock_type
    AND expires_at <= NOW();

    IF NOT EXISTS (SELECT 1 FROM properties WHERE id = p_property_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Property not found');
    END IF;

    SELECT * INTO v_existing_lock
    FROM property_locks
    WHERE property_id = p_property_id
    AND lock_type = p_lock_type
    AND expires_at > NOW();

    IF v_existing_lock IS NOT NULL THEN
        IF v_existing_lock.admin_id != p_admin_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Property is currently being processed by another admin',
                'locked_by_admin_id', v_existing_lock.admin_id,
                'expires_at', v_existing_lock.expires_at,
                'seconds_remaining', EXTRACT(EPOCH FROM (v_existing_lock.expires_at - NOW()))::INTEGER
            );
        ELSE
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

    v_expires_at := NOW() + (p_timeout_seconds || ' seconds')::INTERVAL;

    INSERT INTO property_locks (
        property_id, admin_id, lock_type, acquired_at, expires_at
    ) VALUES (
        p_property_id, p_admin_id, p_lock_type, NOW(), v_expires_at
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
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Property is currently being processed by another admin (concurrent acquisition)'
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', 'Failed to acquire lock: ' || SQLERRM);
END;
$$;

-- release_property_lock function
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
    IF p_property_id IS NULL OR p_admin_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Property ID and Admin ID are required'
        );
    END IF;

    DELETE FROM property_locks
    WHERE property_id = p_property_id
    AND admin_id = p_admin_id
    AND lock_type = p_lock_type;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count = 0 THEN
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

-- extend_property_lock function
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

    IF v_existing_lock.admin_id != p_admin_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Lock is held by a different admin',
            'locked_by', v_existing_lock.admin_id,
            'extended', false
        );
    END IF;

    IF v_existing_lock.expires_at <= NOW() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Lock has expired - acquire a new lock',
            'expired_at', v_existing_lock.expires_at,
            'extended', false
        );
    END IF;

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

-- cleanup_expired_locks function
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

-- get_property_lock_status function
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
-- FIX 2: Property Status Transitions Table & Functions
-- =============================================
CREATE TABLE IF NOT EXISTS property_status_transitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    old_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_status_transitions_property_id
    ON property_status_transitions(property_id);
CREATE INDEX IF NOT EXISTS idx_property_status_transitions_created_at
    ON property_status_transitions(created_at);

ALTER TABLE property_status_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all status transitions" ON property_status_transitions;
CREATE POLICY "Admins can view all status transitions" ON property_status_transitions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "System can insert status transitions" ON property_status_transitions;
CREATE POLICY "System can insert status transitions" ON property_status_transitions
    FOR INSERT WITH CHECK (true);

-- transition_property_status function
CREATE OR REPLACE FUNCTION transition_property_status(
    p_property_id UUID,
    p_new_status TEXT,
    p_admin_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_record RECORD;
    v_old_status TEXT;
    v_transition_log_id UUID;
    v_result JSONB;
    v_valid_transition BOOLEAN := false;
BEGIN
    IF p_property_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Property ID is required'
        );
    END IF;

    IF p_new_status IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'New status is required'
        );
    END IF;

    IF p_new_status NOT IN ('pending', 'active', 'rejected', 'inactive') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid status value. Must be: pending, active, rejected, or inactive'
        );
    END IF;

    SELECT id, status, owner_id, title
    INTO v_current_record
    FROM properties
    WHERE id = p_property_id
    FOR UPDATE;

    IF v_current_record IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Property not found'
        );
    END IF;

    v_old_status := v_current_record.status;

    IF v_old_status = p_new_status THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Property already has status: ' || p_new_status,
            'property_id', p_property_id,
            'status', p_new_status,
            'changed', false
        );
    END IF;

    CASE v_old_status
        WHEN 'pending' THEN
            IF p_new_status IN ('active', 'rejected') THEN
                v_valid_transition := true;
            END IF;
        WHEN 'active' THEN
            IF p_new_status IN ('inactive', 'rejected') THEN
                v_valid_transition := true;
            END IF;
        WHEN 'inactive' THEN
            IF p_new_status IN ('active', 'pending') THEN
                v_valid_transition := true;
            END IF;
        WHEN 'rejected' THEN
            IF p_new_status IN ('pending', 'active') THEN
                v_valid_transition := true;
            END IF;
        ELSE
            v_valid_transition := false;
    END CASE;

    IF NOT v_valid_transition THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid status transition: ' || v_old_status || ' -> ' || p_new_status,
            'property_id', p_property_id,
            'current_status', v_old_status,
            'requested_status', p_new_status
        );
    END IF;

    INSERT INTO property_status_transitions (
        property_id,
        old_status,
        new_status,
        admin_id,
        reason,
        created_at
    ) VALUES (
        p_property_id,
        v_old_status,
        p_new_status,
        p_admin_id,
        p_reason,
        NOW()
    )
    RETURNING id INTO v_transition_log_id;

    UPDATE properties
    SET
        status = p_new_status,
        updated_at = NOW(),
        published_at = CASE
            WHEN p_new_status = 'active' AND published_at IS NULL THEN NOW()
            ELSE published_at
        END,
        availability = CASE
            WHEN p_new_status = 'active' THEN 'Available'
            WHEN p_new_status = 'inactive' THEN 'Under Maintenance'
            ELSE availability
        END,
        featured = CASE
            WHEN p_new_status IN ('inactive', 'rejected') THEN false
            ELSE featured
        END
    WHERE id = p_property_id;

    v_result := jsonb_build_object(
        'success', true,
        'message', 'Status transition completed successfully',
        'property_id', p_property_id,
        'transition_id', v_transition_log_id,
        'old_status', v_old_status,
        'new_status', p_new_status,
        'changed', true,
        'owner_id', v_current_record.owner_id,
        'property_title', v_current_record.title
    );

    RETURN v_result;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Status transition failed for property %: %', p_property_id, SQLERRM;

        RETURN jsonb_build_object(
            'success', false,
            'error', 'Transaction failed: ' || SQLERRM,
            'property_id', p_property_id,
            'requested_status', p_new_status
        );
END;
$$;

-- set_property_featured function
CREATE OR REPLACE FUNCTION set_property_featured(
    p_property_id UUID,
    p_featured BOOLEAN,
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_record RECORD;
    v_result JSONB;
BEGIN
    IF p_property_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Property ID is required'
        );
    END IF;

    SELECT id, status, featured, owner_id, title
    INTO v_current_record
    FROM properties
    WHERE id = p_property_id
    FOR UPDATE;

    IF v_current_record IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Property not found'
        );
    END IF;

    IF p_featured AND v_current_record.status != 'active' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Only active properties can be featured. Current status: ' || v_current_record.status,
            'property_id', p_property_id,
            'current_status', v_current_record.status
        );
    END IF;

    IF v_current_record.featured = p_featured THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Property featured status already set to: ' || p_featured,
            'property_id', p_property_id,
            'featured', p_featured,
            'changed', false
        );
    END IF;

    UPDATE properties
    SET
        featured = p_featured,
        updated_at = NOW()
    WHERE id = p_property_id;

    INSERT INTO property_status_transitions (
        property_id,
        old_status,
        new_status,
        admin_id,
        reason,
        created_at
    ) VALUES (
        p_property_id,
        v_current_record.status,
        v_current_record.status,
        p_admin_id,
        'Featured status changed to: ' || p_featured,
        NOW()
    );

    v_result := jsonb_build_object(
        'success', true,
        'message', 'Featured status updated successfully',
        'property_id', p_property_id,
        'featured', p_featured,
        'changed', true,
        'owner_id', v_current_record.owner_id,
        'property_title', v_current_record.title
    );

    RETURN v_result;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Featured status update failed for property %: %', p_property_id, SQLERRM;

        RETURN jsonb_build_object(
            'success', false,
            'error', 'Update failed: ' || SQLERRM,
            'property_id', p_property_id
        );
END;
$$;

-- bulk_transition_property_status function
CREATE OR REPLACE FUNCTION bulk_transition_property_status(
    p_property_ids UUID[],
    p_new_status TEXT,
    p_admin_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_property_id UUID;
    v_result JSONB;
    v_results JSONB[] := ARRAY[]::JSONB[];
    v_success_count INTEGER := 0;
    v_failure_count INTEGER := 0;
BEGIN
    IF p_property_ids IS NULL OR array_length(p_property_ids, 1) IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Property IDs array is required'
        );
    END IF;

    FOREACH v_property_id IN ARRAY p_property_ids
    LOOP
        v_result := transition_property_status(
            v_property_id,
            p_new_status,
            p_admin_id,
            p_reason
        );

        v_results := array_append(v_results, v_result);

        IF (v_result->>'success')::BOOLEAN THEN
            v_success_count := v_success_count + 1;
        ELSE
            v_failure_count := v_failure_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', v_failure_count = 0,
        'total', array_length(p_property_ids, 1),
        'successful', v_success_count,
        'failed', v_failure_count,
        'results', v_results
    );
END;
$$;

-- get_property_status_history function
CREATE OR REPLACE FUNCTION get_property_status_history(
    p_property_id UUID
)
RETURNS TABLE (
    id UUID,
    old_status TEXT,
    new_status TEXT,
    admin_name TEXT,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        pst.id,
        pst.old_status,
        pst.new_status,
        u.name as admin_name,
        pst.reason,
        pst.created_at
    FROM property_status_transitions pst
    LEFT JOIN users u ON pst.admin_id = u.id
    WHERE pst.property_id = p_property_id
    ORDER BY pst.created_at DESC;
END;
$$;

-- =============================================
-- FIX 3: Bulk Import Idempotency Table
-- =============================================
CREATE TABLE IF NOT EXISTS bulk_import_idempotency (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES bulk_import_jobs(id) ON DELETE CASCADE,
    operation_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    result JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(job_id, operation_key)
);

CREATE INDEX IF NOT EXISTS idx_bulk_import_idempotency_job ON bulk_import_idempotency(job_id);
CREATE INDEX IF NOT EXISTS idx_bulk_import_idempotency_status ON bulk_import_idempotency(status);

-- =============================================
-- FIX 4: Bulk Import Staged Images Table
-- =============================================
CREATE TABLE IF NOT EXISTS bulk_import_staged_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES bulk_import_jobs(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_path TEXT,
    extracted_psn TEXT,
    storage_path TEXT,
    file_size INTEGER,
    mime_type TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'failed', 'orphaned')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    uploaded_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_bulk_import_staged_images_job_id ON bulk_import_staged_images(job_id);
CREATE INDEX IF NOT EXISTS idx_bulk_import_staged_images_status ON bulk_import_staged_images(status);
CREATE INDEX IF NOT EXISTS idx_bulk_import_staged_images_psn ON bulk_import_staged_images(extracted_psn);

-- =============================================
-- FIX 5: Property Image Uploads Table
-- =============================================
CREATE TABLE IF NOT EXISTS property_image_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    upload_session_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    storage_path TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'failed', 'orphaned')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_property_image_uploads_session ON property_image_uploads(upload_session_id);
CREATE INDEX IF NOT EXISTS idx_property_image_uploads_property ON property_image_uploads(property_id);
CREATE INDEX IF NOT EXISTS idx_property_image_uploads_status ON property_image_uploads(status);

-- =============================================
-- FIX 6: Payment Logs Order ID Column
-- =============================================
ALTER TABLE payment_logs ADD COLUMN IF NOT EXISTS order_id TEXT;
CREATE INDEX IF NOT EXISTS idx_payment_logs_order_id ON payment_logs(order_id);

-- =============================================
-- FIX 7: Rollback Function for Bulk Import
-- =============================================
CREATE OR REPLACE FUNCTION rollback_bulk_import_properties(p_job_id UUID)
RETURNS TABLE(deleted_property_id UUID, psn TEXT, success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_property RECORD;
    v_job_created_at TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT created_at INTO v_job_created_at FROM bulk_import_jobs WHERE id = p_job_id;

    IF v_job_created_at IS NULL THEN
        RETURN;
    END IF;

    FOR v_property IN
        SELECT p.id, p.psn
        FROM properties p
        WHERE p.created_at >= v_job_created_at
        AND p.created_at <= v_job_created_at + INTERVAL '1 hour'
        AND EXISTS (
            SELECT 1 FROM bulk_import_jobs j
            WHERE j.id = p_job_id
            AND j.parsed_properties::text LIKE '%' || p.psn || '%'
        )
    LOOP
        BEGIN
            DELETE FROM properties WHERE id = v_property.id;
            RETURN QUERY SELECT v_property.id, v_property.psn, true, NULL::TEXT;
        EXCEPTION WHEN OTHERS THEN
            RETURN QUERY SELECT v_property.id, v_property.psn, false, SQLERRM::TEXT;
        END;
    END LOOP;
END;
$$;

-- =============================================
-- FIX 8: Mark Image Upload Failed Function
-- =============================================
CREATE OR REPLACE FUNCTION mark_image_upload_failed(
    p_upload_session_id TEXT,
    p_filename TEXT,
    p_error_message TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE property_image_uploads
    SET status = 'failed',
        error_message = p_error_message,
        completed_at = NOW()
    WHERE upload_session_id = p_upload_session_id
    AND filename = p_filename;

    RETURN jsonb_build_object('success', true, 'message', 'Upload marked as failed');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- =============================================
-- FIX 9: Mark Orphaned Uploads Function
-- =============================================
CREATE OR REPLACE FUNCTION mark_orphaned_uploads(p_upload_session_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE property_image_uploads
    SET status = 'orphaned'
    WHERE upload_session_id = p_upload_session_id
    AND status = 'pending';

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'orphaned_count', v_count);
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- =============================================
-- FIX 10: Missing Indexes for Performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_admin_status ON bulk_import_jobs(admin_id, status);
CREATE INDEX IF NOT EXISTS idx_properties_psn ON properties(psn) WHERE psn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions(user_id, status);

-- =============================================
-- FIX 11: Properties Bulk Import Columns
-- =============================================
ALTER TABLE properties
    ADD COLUMN IF NOT EXISTS bulk_import_job_id UUID REFERENCES bulk_import_jobs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS bulk_import_psn TEXT;

CREATE INDEX IF NOT EXISTS idx_properties_bulk_import_job
    ON properties(bulk_import_job_id)
    WHERE bulk_import_job_id IS NOT NULL;

-- =============================================
-- FIX 12: Fix preferred_tenant constraint
-- =============================================
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_preferred_tenant_check;

UPDATE properties
SET preferred_tenant = NULL
WHERE preferred_tenant NOT IN ('Male', 'Female', 'Couple')
   OR preferred_tenant = 'Any';

ALTER TABLE properties
ADD CONSTRAINT properties_preferred_tenant_check
CHECK (preferred_tenant IN ('Male', 'Female', 'Couple') OR preferred_tenant IS NULL);

COMMENT ON COLUMN properties.preferred_tenant IS 'Preferred tenant gender: Male, Female, Couple, or NULL for non-PG properties';

-- =============================================
-- FIX 13: Grant Permissions
-- =============================================
GRANT EXECUTE ON FUNCTION acquire_property_lock(UUID, UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION release_property_lock(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION extend_property_lock(UUID, UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_locks() TO authenticated;
GRANT EXECUTE ON FUNCTION get_property_lock_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION transition_property_status(UUID, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION set_property_featured(UUID, BOOLEAN, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_transition_property_status(UUID[], TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_property_status_history(UUID) TO authenticated;

-- ============================================================================
-- STEP 3: VERIFY FIXES
-- ============================================================================

DO $$
DECLARE
    v_count INTEGER;
    v_missing_objects TEXT := '';
BEGIN
    RAISE NOTICE '=== VERIFICATION AFTER FIXES ===';

    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'property_locks';
    IF v_count = 0 THEN v_missing_objects := v_missing_objects || 'property_locks table, '; END IF;
    RAISE NOTICE 'property_locks table: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'bulk_import_idempotency';
    IF v_count = 0 THEN v_missing_objects := v_missing_objects || 'bulk_import_idempotency table, '; END IF;
    RAISE NOTICE 'bulk_import_idempotency table: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'bulk_import_staged_images';
    IF v_count = 0 THEN v_missing_objects := v_missing_objects || 'bulk_import_staged_images table, '; END IF;
    RAISE NOTICE 'bulk_import_staged_images table: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'property_image_uploads';
    IF v_count = 0 THEN v_missing_objects := v_missing_objects || 'property_image_uploads table, '; END IF;
    RAISE NOTICE 'property_image_uploads table: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'property_status_transitions';
    IF v_count = 0 THEN v_missing_objects := v_missing_objects || 'property_status_transitions table, '; END IF;
    RAISE NOTICE 'property_status_transitions table: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM information_schema.columns WHERE table_name = 'payment_logs' AND column_name = 'order_id';
    IF v_count = 0 THEN v_missing_objects := v_missing_objects || 'payment_logs.order_id column, '; END IF;
    RAISE NOTICE 'payment_logs.order_id column: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'acquire_property_lock';
    IF v_count = 0 THEN v_missing_objects := v_missing_objects || 'acquire_property_lock function, '; END IF;
    RAISE NOTICE 'acquire_property_lock function: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'release_property_lock';
    IF v_count = 0 THEN v_missing_objects := v_missing_objects || 'release_property_lock function, '; END IF;
    RAISE NOTICE 'release_property_lock function: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'extend_property_lock';
    IF v_count = 0 THEN v_missing_objects := v_missing_objects || 'extend_property_lock function, '; END IF;
    RAISE NOTICE 'extend_property_lock function: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'transition_property_status';
    IF v_count = 0 THEN v_missing_objects := v_missing_objects || 'transition_property_status function, '; END IF;
    RAISE NOTICE 'transition_property_status function: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'set_property_featured';
    IF v_count = 0 THEN v_missing_objects := v_missing_objects || 'set_property_featured function, '; END IF;
    RAISE NOTICE 'set_property_featured function: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'bulk_transition_property_status';
    IF v_count = 0 THEN v_missing_objects := v_missing_objects || 'bulk_transition_property_status function, '; END IF;
    RAISE NOTICE 'bulk_transition_property_status function: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'get_property_status_history';
    IF v_count = 0 THEN v_missing_objects := v_missing_objects || 'get_property_status_history function, '; END IF;
    RAISE NOTICE 'get_property_status_history function: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'rollback_bulk_import_properties';
    IF v_count = 0 THEN v_missing_objects := v_missing_objects || 'rollback_bulk_import_properties function, '; END IF;
    RAISE NOTICE 'rollback_bulk_import_properties function: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'cleanup_expired_locks';
    IF v_count = 0 THEN v_missing_objects := v_missing_objects || 'cleanup_expired_locks function, '; END IF;
    RAISE NOTICE 'cleanup_expired_locks function: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'get_property_lock_status';
    IF v_count = 0 THEN v_missing_objects := v_missing_objects || 'get_property_lock_status function, '; END IF;
    RAISE NOTICE 'get_property_lock_status function: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    IF v_missing_objects = '' THEN
        RAISE NOTICE '=== ALL FIXES APPLIED SUCCESSFULLY ===';
        RAISE NOTICE 'You can now approve properties and use bulk import.';
    ELSE
        RAISE NOTICE '=== SOME FIXES FAILED ===';
        RAISE NOTICE 'Missing objects: %', v_missing_objects;
    END IF;
END $$;
