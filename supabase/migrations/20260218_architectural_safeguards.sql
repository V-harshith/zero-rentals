-- ============================================================================
-- Architectural Safeguards: Database Triggers and Constraints
-- ============================================================================
-- This migration adds comprehensive database-level safeguards including:
-- - Data integrity triggers
-- - Audit logging
-- - Constraint validation
-- - Automatic timestamp management
-- - Soft delete support preparation
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Audit Log Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data JSONB,
    new_data JSONB,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    session_id TEXT,
    ip_address INET,
    user_agent TEXT
);

-- Indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_at ON audit_logs(changed_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_by ON audit_logs(changed_by);

-- Enable RLS on audit logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Only admins can view audit logs" ON audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ============================================================================
-- Data Integrity Validation Functions
-- ============================================================================

-- Function to validate property type and room type combination
CREATE OR REPLACE FUNCTION validate_property_room_type()
RETURNS TRIGGER AS $$
BEGIN
    -- PG and Co-living should not have 'Apartment' room type
    IF NEW.property_type IN ('PG', 'Co-living') AND NEW.room_type = 'Apartment' THEN
        RAISE EXCEPTION 'Invalid room type: % properties cannot have Apartment room type', NEW.property_type;
    END IF;

    -- Rent properties should not have sharing room types
    IF NEW.property_type = 'Rent' AND NEW.room_type IN ('Single', 'Double', 'Triple', 'Four Sharing') THEN
        RAISE EXCEPTION 'Invalid room type: Rent properties should use 1RK or Apartment, not sharing types';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate price consistency
CREATE OR REPLACE FUNCTION validate_property_pricing()
RETURNS TRIGGER AS $$
BEGIN
    -- At least one price must be set for active properties
    IF NEW.status = 'active' AND NEW.availability = 'Available' THEN
        IF (NEW.one_rk_price IS NULL OR NEW.one_rk_price = 0) AND
           (NEW.private_room_price IS NULL OR NEW.private_room_price = 0) AND
           (NEW.double_sharing_price IS NULL OR NEW.double_sharing_price = 0) AND
           (NEW.triple_sharing_price IS NULL OR NEW.triple_sharing_price = 0) AND
           (NEW.four_sharing_price IS NULL OR NEW.four_sharing_price = 0) THEN
            RAISE EXCEPTION 'At least one price must be set for active properties';
        END IF;
    END IF;

    -- All prices must be non-negative
    IF NEW.one_rk_price < 0 OR
       NEW.private_room_price < 0 OR
       NEW.double_sharing_price < 0 OR
       NEW.triple_sharing_price < 0 OR
       NEW.four_sharing_price < 0 OR
       COALESCE(NEW.deposit, 0) < 0 OR
       COALESCE(NEW.maintenance, 0) < 0 THEN
        RAISE EXCEPTION 'Prices cannot be negative';
    END IF;

    -- Prices cannot exceed 10 crore (100 million)
    IF NEW.one_rk_price > 100000000 OR
       NEW.private_room_price > 100000000 OR
       NEW.double_sharing_price > 100000000 OR
       NEW.triple_sharing_price > 100000000 OR
       NEW.four_sharing_price > 100000000 THEN
        RAISE EXCEPTION 'Prices cannot exceed 10 crore';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate floor numbers
CREATE OR REPLACE FUNCTION validate_floor_numbers()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.floor_number IS NOT NULL AND NEW.total_floors IS NOT NULL THEN
        IF NEW.floor_number > NEW.total_floors THEN
            RAISE EXCEPTION 'Floor number (%) cannot exceed total floors (%)',
                NEW.floor_number, NEW.total_floors;
        END IF;
    END IF;

    -- Floor number cannot be negative
    IF NEW.floor_number < 0 THEN
        RAISE EXCEPTION 'Floor number cannot be negative';
    END IF;

    -- Total floors must be positive if set
    IF NEW.total_floors IS NOT NULL AND NEW.total_floors < 1 THEN
        RAISE EXCEPTION 'Total floors must be at least 1';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate coordinates
CREATE OR REPLACE FUNCTION validate_coordinates()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL THEN
        IF NEW.latitude < -90 OR NEW.latitude > 90 THEN
            RAISE EXCEPTION 'Latitude must be between -90 and 90, got %', NEW.latitude;
        END IF;
    END IF;

    IF NEW.longitude IS NOT NULL THEN
        IF NEW.longitude < -180 OR NEW.longitude > 180 THEN
            RAISE EXCEPTION 'Longitude must be between -180 and 180, got %', NEW.longitude;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate user email format
CREATE OR REPLACE FUNCTION validate_email_format()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'Invalid email format: %', NEW.email;
    END IF;

    -- Normalize email to lowercase
    NEW.email := LOWER(NEW.email);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate phone number format
CREATE OR REPLACE FUNCTION validate_phone_format()
RETURNS TRIGGER AS $$
DECLARE
    digits TEXT;
BEGIN
    IF NEW.phone IS NOT NULL THEN
        -- Extract digits only
        digits := REGEXP_REPLACE(NEW.phone, '\D', '', 'g');

        -- Must be 10 digits starting with 6-9
        IF digits !~ '^[6-9]\d{9}$' THEN
            RAISE EXCEPTION 'Invalid phone number format: %', NEW.phone;
        END IF;

        -- Normalize to digits only
        NEW.phone := digits;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate pincode format
CREATE OR REPLACE FUNCTION validate_pincode_format()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if pincode column exists (added in later migration)
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'properties' AND column_name = 'pincode') THEN
        IF NEW.pincode IS NOT NULL AND NEW.pincode !~ '^\d{6}$' THEN
            RAISE EXCEPTION 'Invalid pincode format: %. Must be 6 digits.', NEW.pincode;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate subscription dates
CREATE OR REPLACE FUNCTION validate_subscription_dates()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.end_date <= NEW.start_date THEN
        RAISE EXCEPTION 'Subscription end date must be after start date';
    END IF;

    IF NEW.start_date < NOW() - INTERVAL '1 day' THEN
        RAISE EXCEPTION 'Subscription start date cannot be in the past';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate payment amount
CREATE OR REPLACE FUNCTION validate_payment_amount()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be positive';
    END IF;

    IF NEW.amount > 100000000 THEN
        RAISE EXCEPTION 'Payment amount cannot exceed 10 crore';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Audit Logging Function
-- ============================================================================

CREATE OR REPLACE FUNCTION log_audit_event()
RETURNS TRIGGER AS $$
DECLARE
    old_data JSONB;
    new_data JSONB;
    record_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        old_data := to_jsonb(OLD);
        new_data := null;
        record_id := OLD.id;
    ELSIF TG_OP = 'INSERT' THEN
        old_data := null;
        new_data := to_jsonb(NEW);
        record_id := NEW.id;
    ELSIF TG_OP = 'UPDATE' THEN
        old_data := to_jsonb(OLD);
        new_data := to_jsonb(NEW);
        record_id := NEW.id;
    END IF;

    INSERT INTO audit_logs (
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        changed_by,
        changed_at
    ) VALUES (
        TG_TABLE_NAME,
        record_id,
        TG_OP,
        old_data,
        new_data,
        auth.uid(),
        NOW()
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Automatic Timestamp Management
-- ============================================================================

CREATE OR REPLACE FUNCTION manage_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_at := COALESCE(NEW.created_at, NOW());
        NEW.updated_at := NOW();
    ELSIF TG_OP = 'UPDATE' THEN
        NEW.created_at := OLD.created_at; -- Prevent changing created_at
        NEW.updated_at := NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Property Status Transition Validation
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_property_status_transition()
RETURNS TRIGGER AS $$
DECLARE
    allowed_transitions JSONB := '{
        "pending": ["active", "rejected"],
        "active": ["inactive", "pending"],
        "inactive": ["active", "pending"],
        "rejected": ["pending"]
    }'::jsonb;
    allowed_from_new JSONB;
BEGIN
    -- Skip if status hasn't changed
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Get allowed transitions from old status
    allowed_from_new := allowed_transitions->OLD.status;

    IF allowed_from_new IS NULL OR NOT (NEW.status = ANY(ARRAY(SELECT jsonb_array_elements_text(allowed_from_new)))) THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
    END IF;

    -- Set published_at when transitioning to active
    IF NEW.status = 'active' AND OLD.status != 'active' THEN
        NEW.published_at := COALESCE(NEW.published_at, NOW());
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- User Role Change Validation
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_user_role_change()
RETURNS TRIGGER AS $$
DECLARE
    property_count INTEGER;
BEGIN
    -- Prevent role change if user has properties (owner -> non-owner)
    IF OLD.role = 'owner' AND NEW.role != 'owner' THEN
        SELECT COUNT(*) INTO property_count FROM properties WHERE owner_id = OLD.id;
        IF property_count > 0 THEN
            RAISE EXCEPTION 'Cannot change role: user has % properties', property_count;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Inquiry Status Transition Validation
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_inquiry_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'closed' AND NEW.status != 'closed' THEN
        RAISE EXCEPTION 'Cannot reopen a closed inquiry';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Apply Triggers to Tables
-- ============================================================================

-- Properties table triggers
DROP TRIGGER IF EXISTS trigger_validate_property_room_type ON properties;
CREATE TRIGGER trigger_validate_property_room_type
    BEFORE INSERT OR UPDATE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION validate_property_room_type();

DROP TRIGGER IF EXISTS trigger_validate_property_pricing ON properties;
CREATE TRIGGER trigger_validate_property_pricing
    BEFORE INSERT OR UPDATE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION validate_property_pricing();

DROP TRIGGER IF EXISTS trigger_validate_floor_numbers ON properties;
CREATE TRIGGER trigger_validate_floor_numbers
    BEFORE INSERT OR UPDATE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION validate_floor_numbers();

DROP TRIGGER IF EXISTS trigger_validate_coordinates ON properties;
CREATE TRIGGER trigger_validate_coordinates
    BEFORE INSERT OR UPDATE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION validate_coordinates();

DROP TRIGGER IF EXISTS trigger_validate_pincode_format ON properties;
CREATE TRIGGER trigger_validate_pincode_format
    BEFORE INSERT OR UPDATE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION validate_pincode_format();

DROP TRIGGER IF EXISTS trigger_validate_property_status_transition ON properties;
CREATE TRIGGER trigger_validate_property_status_transition
    BEFORE UPDATE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION validate_property_status_transition();

DROP TRIGGER IF EXISTS trigger_properties_audit ON properties;
CREATE TRIGGER trigger_properties_audit
    AFTER INSERT OR UPDATE OR DELETE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS trigger_properties_timestamps ON properties;
CREATE TRIGGER trigger_properties_timestamps
    BEFORE INSERT OR UPDATE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION manage_timestamps();

-- Users table triggers
DROP TRIGGER IF EXISTS trigger_validate_email_format ON users;
CREATE TRIGGER trigger_validate_email_format
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION validate_email_format();

DROP TRIGGER IF EXISTS trigger_validate_phone_format ON users;
CREATE TRIGGER trigger_validate_phone_format
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION validate_phone_format();

DROP TRIGGER IF EXISTS trigger_validate_user_role_change ON users;
CREATE TRIGGER trigger_validate_user_role_change
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION validate_user_role_change();

DROP TRIGGER IF EXISTS trigger_users_audit ON users;
CREATE TRIGGER trigger_users_audit
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW
    EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS trigger_users_timestamps ON users;
CREATE TRIGGER trigger_users_timestamps
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION manage_timestamps();

-- Subscriptions table triggers
DROP TRIGGER IF EXISTS trigger_validate_subscription_dates ON subscriptions;
CREATE TRIGGER trigger_validate_subscription_dates
    BEFORE INSERT OR UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION validate_subscription_dates();

DROP TRIGGER IF EXISTS trigger_subscriptions_audit ON subscriptions;
CREATE TRIGGER trigger_subscriptions_audit
    AFTER INSERT OR UPDATE OR DELETE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS trigger_subscriptions_timestamps ON subscriptions;
CREATE TRIGGER trigger_subscriptions_timestamps
    BEFORE INSERT OR UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION manage_timestamps();

-- Inquiries table triggers
DROP TRIGGER IF EXISTS trigger_validate_inquiry_status_transition ON inquiries;
CREATE TRIGGER trigger_validate_inquiry_status_transition
    BEFORE UPDATE ON inquiries
    FOR EACH ROW
    EXECUTE FUNCTION validate_inquiry_status_transition();

DROP TRIGGER IF EXISTS trigger_inquiries_audit ON inquiries;
CREATE TRIGGER trigger_inquiries_audit
    AFTER INSERT OR UPDATE OR DELETE ON inquiries
    FOR EACH ROW
    EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS trigger_inquiries_timestamps ON inquiries;
CREATE TRIGGER trigger_inquiries_timestamps
    BEFORE INSERT OR UPDATE ON inquiries
    FOR EACH ROW
    EXECUTE FUNCTION manage_timestamps();

-- Payment logs triggers
DROP TRIGGER IF EXISTS trigger_validate_payment_amount ON payment_logs;
CREATE TRIGGER trigger_validate_payment_amount
    BEFORE INSERT OR UPDATE ON payment_logs
    FOR EACH ROW
    EXECUTE FUNCTION validate_payment_amount();

DROP TRIGGER IF EXISTS trigger_payment_logs_audit ON payment_logs;
CREATE TRIGGER trigger_payment_logs_audit
    AFTER INSERT OR UPDATE ON payment_logs
    FOR EACH ROW
    EXECUTE FUNCTION log_audit_event();

-- Messages triggers
DROP TRIGGER IF EXISTS trigger_messages_audit ON messages;
CREATE TRIGGER trigger_messages_audit
    AFTER INSERT OR UPDATE OR DELETE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION log_audit_event();

-- Favorites triggers
DROP TRIGGER IF EXISTS trigger_favorites_audit ON favorites;
CREATE TRIGGER trigger_favorites_audit
    AFTER INSERT OR DELETE ON favorites
    FOR EACH ROW
    EXECUTE FUNCTION log_audit_event();

-- Notifications triggers
DROP TRIGGER IF EXISTS trigger_notifications_audit ON notifications;
CREATE TRIGGER trigger_notifications_audit
    AFTER INSERT OR UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION log_audit_event();

-- ============================================================================
-- Additional Constraints
-- ============================================================================

-- Ensure unique email (case insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));

-- Ensure unique phone (if provided)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;

-- Ensure unique favorites
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_unique ON favorites(user_id, property_id);

-- Ensure unique transaction_id in payment_logs
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_logs_transaction ON payment_logs(transaction_id)
    WHERE transaction_id IS NOT NULL;

-- ============================================================================
-- Helper Functions for Application Use
-- ============================================================================

-- Function to get audit trail for a record
CREATE OR REPLACE FUNCTION get_audit_trail(
    p_table_name TEXT,
    p_record_id UUID,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    action TEXT,
    changed_at TIMESTAMP WITH TIME ZONE,
    changed_by UUID,
    changes JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.action,
        al.changed_at,
        al.changed_by,
        CASE
            WHEN al.action = 'UPDATE' THEN
                jsonb_object_agg(
                    key,
                    jsonb_build_object('old', al.old_data->key, 'new', al.new_data->key)
                ) FILTER (WHERE al.old_data->key IS DISTINCT FROM al.new_data->key)
            WHEN al.action = 'DELETE' THEN al.old_data
            ELSE al.new_data
        END as changes
    FROM audit_logs al
    WHERE al.table_name = p_table_name
      AND al.record_id = p_record_id
    GROUP BY al.id, al.action, al.changed_at, al.changed_by, al.old_data, al.new_data
    ORDER BY al.changed_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if a property can be deleted
CREATE OR REPLACE FUNCTION can_delete_property(p_property_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    has_active_inquiries BOOLEAN;
    has_active_subscriptions BOOLEAN;
BEGIN
    -- Check for active inquiries
    SELECT EXISTS (
        SELECT 1 FROM inquiries
        WHERE property_id = p_property_id
        AND status IN ('pending', 'responded')
    ) INTO has_active_inquiries;

    IF has_active_inquiries THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to safely delete a property with checks
CREATE OR REPLACE FUNCTION safe_delete_property(
    p_property_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    IF NOT can_delete_property(p_property_id) THEN
        RAISE EXCEPTION 'Cannot delete property: has active inquiries or subscriptions';
    END IF;

    -- Soft delete by setting status to inactive
    UPDATE properties
    SET status = 'inactive',
        availability = 'Under Maintenance'
    WHERE id = p_property_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE audit_logs IS 'Tracks all changes to main tables for audit purposes';
COMMENT ON FUNCTION validate_property_room_type() IS 'Ensures property type and room type combinations are valid';
COMMENT ON FUNCTION validate_property_pricing() IS 'Ensures at least one price is set and all prices are valid';
COMMENT ON FUNCTION validate_property_status_transition() IS 'Enforces valid property status transitions';
COMMENT ON FUNCTION log_audit_event() IS 'Logs all DML operations to audit_logs table';
COMMENT ON FUNCTION get_audit_trail() IS 'Returns audit history for a specific record';
COMMENT ON FUNCTION can_delete_property() IS 'Checks if a property can be safely deleted';
COMMENT ON FUNCTION safe_delete_property() IS 'Safely deletes a property with validation checks';
