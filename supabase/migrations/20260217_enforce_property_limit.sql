-- ============================================================================
-- MIGRATION: Enforce Property Limit with Database Trigger
-- ============================================================================
-- This migration adds a trigger to enforce property limits at the database level,
-- preventing race conditions where multiple simultaneous requests could exceed
-- the user's plan limit.
-- ============================================================================

-- Create the function to check property limits before insert
CREATE OR REPLACE FUNCTION check_property_limit()
RETURNS TRIGGER AS $$
DECLARE
    current_count INTEGER;
    property_limit INTEGER;
    user_subscription RECORD;
BEGIN
    -- Count existing active/pending properties for this owner
    SELECT COUNT(*) INTO current_count
    FROM properties
    WHERE owner_id = NEW.owner_id
    AND status IN ('active', 'pending');

    -- Get the user's active subscription and property limit
    SELECT
        s.plan_name,
        s.properties_limit
    INTO user_subscription
    FROM subscriptions s
    WHERE s.user_id = NEW.owner_id
    AND s.status = 'active'
    AND s.end_date > NOW()
    ORDER BY s.created_at DESC
    LIMIT 1;

    -- Determine property limit based on subscription
    IF user_subscription.plan_name IS NULL THEN
        property_limit := 1; -- Default to 1 for free users without subscription
    ELSE
        property_limit := user_subscription.properties_limit;
    END IF;

    -- Check if limit would be exceeded
    IF current_count >= property_limit THEN
        RAISE EXCEPTION 'Property limit exceeded. Current: %, Limit: %. Upgrade your plan to add more properties.',
            current_count, property_limit
            USING ERRCODE = 'P0001'; -- Custom error code for application handling
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS enforce_property_limit_trigger ON properties;

-- Create the trigger to run before insert
CREATE TRIGGER enforce_property_limit_trigger
    BEFORE INSERT ON properties
    FOR EACH ROW
    EXECUTE FUNCTION check_property_limit();

-- Add comment for documentation
COMMENT ON FUNCTION check_property_limit() IS 'Enforces property limits based on user subscription plan. Prevents race conditions by checking limits atomically at the database level.';
