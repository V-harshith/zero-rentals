-- ============================================================================
-- ZERO RENTALS - PRODUCTION DATABASE DIAGNOSTIC & FIX SCRIPT
-- Run this in Supabase SQL Editor to check and fix missing objects
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

    -- Check property_image_uploads table
    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'property_image_uploads';
    RAISE NOTICE 'property_image_uploads table: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    -- Check payment_logs.order_id column
    SELECT COUNT(*) INTO v_count FROM information_schema.columns WHERE table_name = 'payment_logs' AND column_name = 'order_id';
    RAISE NOTICE 'payment_logs.order_id column: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    -- Check bulk_import_staged_images table
    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'bulk_import_staged_images';
    RAISE NOTICE 'bulk_import_staged_images table: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    -- Check functions
    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'acquire_property_lock';
    RAISE NOTICE 'acquire_property_lock function: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'release_property_lock';
    RAISE NOTICE 'release_property_lock function: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'transition_property_status';
    RAISE NOTICE 'transition_property_status function: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'rollback_bulk_import_properties';
    RAISE NOTICE 'rollback_bulk_import_properties function: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'mark_image_upload_failed';
    RAISE NOTICE 'mark_image_upload_failed function: %', CASE WHEN v_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;

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
AS $$
DECLARE
    v_deleted BOOLEAN;
BEGIN
    DELETE FROM property_locks
    WHERE property_id = p_property_id
    AND admin_id = p_admin_id
    AND lock_type = p_lock_type;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'released', v_deleted > 0,
        'message', CASE WHEN v_deleted > 0 THEN 'Lock released' ELSE 'No lock found' END
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- =============================================
-- FIX 2: Bulk Import Idempotency Table
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
-- FIX 3: Bulk Import Staged Images Table
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
-- FIX 4: Property Image Uploads Table
-- =============================================
CREATE TABLE IF NOT EXISTS property_image_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
-- FIX 5: Payment Logs Order ID Column
-- =============================================
ALTER TABLE payment_logs ADD COLUMN IF NOT EXISTS order_id TEXT;
CREATE INDEX IF NOT EXISTS idx_payment_logs_order_id ON payment_logs(order_id);

-- =============================================
-- FIX 6: Rollback Function for Bulk Import
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
-- FIX 7: Mark Image Upload Failed Function
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
-- FIX 8: Mark Orphaned Uploads Function
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
-- FIX 9: Property Status Transition Function
-- =============================================
-- Table for status transition audit log
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

-- Main transition function
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION transition_property_status(UUID, TEXT, UUID, TEXT) TO authenticated;

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
-- Drop existing constraint if it doesn't allow NULL or has wrong values
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_preferred_tenant_check;

-- Update any invalid values to NULL
UPDATE properties
SET preferred_tenant = NULL
WHERE preferred_tenant NOT IN ('Male', 'Female', 'Couple')
   OR preferred_tenant = 'Any';

-- Add correct constraint: Male, Female, Couple, or NULL
ALTER TABLE properties
ADD CONSTRAINT properties_preferred_tenant_check
CHECK (preferred_tenant IN ('Male', 'Female', 'Couple') OR preferred_tenant IS NULL);

COMMENT ON COLUMN properties.preferred_tenant IS 'Preferred tenant gender: Male, Female, Couple, or NULL for non-PG properties';

-- ============================================================================
-- STEP 3: VERIFY FIXES
-- ============================================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    RAISE NOTICE '=== VERIFICATION AFTER FIXES ===';

    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'property_locks';
    RAISE NOTICE 'property_locks table: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'bulk_import_idempotency';
    RAISE NOTICE 'bulk_import_idempotency table: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'bulk_import_staged_images';
    RAISE NOTICE 'bulk_import_staged_images table: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'property_image_uploads';
    RAISE NOTICE 'property_image_uploads table: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM information_schema.columns WHERE table_name = 'payment_logs' AND column_name = 'order_id';
    RAISE NOTICE 'payment_logs.order_id column: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'acquire_property_lock';
    RAISE NOTICE 'acquire_property_lock function: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'release_property_lock';
    RAISE NOTICE 'release_property_lock function: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'rollback_bulk_import_properties';
    RAISE NOTICE 'rollback_bulk_import_properties function: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'transition_property_status';
    RAISE NOTICE 'transition_property_status function: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'property_status_transitions';
    RAISE NOTICE 'property_status_transitions table: %', CASE WHEN v_count > 0 THEN 'CREATED' ELSE 'FAILED' END;

    RAISE NOTICE '=== ALL FIXES APPLIED ===';
    RAISE NOTICE 'You can now approve properties and use bulk import.';
END $$;
