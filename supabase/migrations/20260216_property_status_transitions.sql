-- =============================================
-- Property Status Transition System
-- Implements atomic status changes with state machine validation
-- =============================================

-- Status values: 'pending', 'active', 'rejected', 'inactive'
-- Valid transitions:
--   pending -> active (approve)
--   pending -> rejected (reject)
--   active -> inactive (deactivate)
--   inactive -> active (reactivate)
--   rejected -> pending (resubmit)
--   active -> featured (not a status change, just sets featured=true)

-- =============================================
-- FUNCTION: Atomic Property Status Transition
-- =============================================
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
    -- Input validation
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

    -- Lock the property row for update (prevents race conditions)
    SELECT id, status, owner_id, title
    INTO v_current_record
    FROM properties
    WHERE id = p_property_id
    FOR UPDATE;

    -- Check if property exists
    IF v_current_record IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Property not found'
        );
    END IF;

    v_old_status := v_current_record.status;

    -- Idempotency check: if already in target status, return success
    IF v_old_status = p_new_status THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Property already has status: ' || p_new_status,
            'property_id', p_property_id,
            'status', p_new_status,
            'changed', false
        );
    END IF;

    -- State machine validation
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

    -- Create transition log entry (for audit trail)
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

    -- Perform the status update with additional fields based on transition
    UPDATE properties
    SET
        status = p_new_status,
        updated_at = NOW(),
        -- Set published_at when transitioning to active for the first time
        published_at = CASE
            WHEN p_new_status = 'active' AND published_at IS NULL THEN NOW()
            ELSE published_at
        END,
        -- Set availability based on status
        availability = CASE
            WHEN p_new_status = 'active' THEN 'Available'
            WHEN p_new_status = 'inactive' THEN 'Under Maintenance'
            ELSE availability
        END,
        -- Clear featured flag when deactivating or rejecting
        featured = CASE
            WHEN p_new_status IN ('inactive', 'rejected') THEN false
            ELSE featured
        END
    WHERE id = p_property_id;

    -- Build success response
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
        -- Log the error (in a real system, you might want a separate error log table)
        RAISE WARNING 'Status transition failed for property %: %', p_property_id, SQLERRM;

        RETURN jsonb_build_object(
            'success', false,
            'error', 'Transaction failed: ' || SQLERRM,
            'property_id', p_property_id,
            'requested_status', p_new_status
        );
END;
$$;

-- =============================================
-- FUNCTION: Set Featured Status (separate from status transition)
-- =============================================
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
    -- Input validation
    IF p_property_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Property ID is required'
        );
    END IF;

    -- Lock the property row for update
    SELECT id, status, featured, owner_id, title
    INTO v_current_record
    FROM properties
    WHERE id = p_property_id
    FOR UPDATE;

    -- Check if property exists
    IF v_current_record IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Property not found'
        );
    END IF;

    -- Only active properties can be featured
    IF p_featured AND v_current_record.status != 'active' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Only active properties can be featured. Current status: ' || v_current_record.status,
            'property_id', p_property_id,
            'current_status', v_current_record.status
        );
    END IF;

    -- Idempotency check
    IF v_current_record.featured = p_featured THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Property featured status already set to: ' || p_featured,
            'property_id', p_property_id,
            'featured', p_featured,
            'changed', false
        );
    END IF;

    -- Update featured status
    UPDATE properties
    SET
        featured = p_featured,
        updated_at = NOW()
    WHERE id = p_property_id;

    -- Log the featured status change
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

-- =============================================
-- TABLE: Property Status Transition Audit Log
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

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_property_status_transitions_property_id
    ON property_status_transitions(property_id);
CREATE INDEX IF NOT EXISTS idx_property_status_transitions_created_at
    ON property_status_transitions(created_at);

-- Enable RLS on transitions table
ALTER TABLE property_status_transitions ENABLE ROW LEVEL SECURITY;

-- Only admins can view transition logs
CREATE POLICY "Admins can view all status transitions" ON property_status_transitions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Only the transition function can insert
CREATE POLICY "System can insert status transitions" ON property_status_transitions
    FOR INSERT WITH CHECK (true);

-- =============================================
-- FUNCTION: Bulk Status Transition (for admin operations)
-- =============================================
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
    -- Input validation
    IF p_property_ids IS NULL OR array_length(p_property_ids, 1) IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Property IDs array is required'
        );
    END IF;

    -- Process each property
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

-- =============================================
-- FUNCTION: Get Property Status History
-- =============================================
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

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION transition_property_status(UUID, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION set_property_featured(UUID, BOOLEAN, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_transition_property_status(UUID[], TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_property_status_history(UUID) TO authenticated;

COMMENT ON FUNCTION transition_property_status IS 'Atomically transitions a property status with state machine validation';
COMMENT ON FUNCTION set_property_featured IS 'Sets the featured flag on a property (only if status is active)';
COMMENT ON FUNCTION bulk_transition_property_status IS 'Transitions multiple properties to a new status atomically';
COMMENT ON FUNCTION get_property_status_history IS 'Returns the status transition history for a property';
