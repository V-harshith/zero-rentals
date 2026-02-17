-- ============================================================================
-- CRITICAL FIX: Prevent duplicate subscriptions per user
-- This ensures only one active subscription per user
-- ============================================================================

-- 1. First, clean up any duplicate subscriptions (keep the most recent active one)
-- Delete duplicate subscriptions keeping only the one with latest end_date
DELETE FROM subscriptions
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY
                   CASE WHEN status = 'active' THEN 0 ELSE 1 END,
                   end_date DESC,
                   created_at DESC
               ) as rn
        FROM subscriptions
    ) sub
    WHERE rn > 1
);

-- 2. Add unique constraint on user_id for active subscriptions
-- This prevents the create-free API from creating duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_user_subscription
ON subscriptions(user_id)
WHERE status = 'active';

-- 3. Create function to safely get or create subscription
CREATE OR REPLACE FUNCTION get_or_create_subscription(
    p_user_id UUID,
    p_plan_name TEXT,
    p_plan_duration TEXT,
    p_amount NUMERIC,
    p_properties_limit INTEGER,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_existing_id UUID;
    v_result JSONB;
BEGIN
    -- Check for existing active subscription
    SELECT id INTO v_existing_id
    FROM subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND end_date > NOW()
    ORDER BY end_date DESC
    LIMIT 1
    FOR UPDATE SKIP LOCKED; -- Prevent race conditions

    IF v_existing_id IS NOT NULL THEN
        -- Return existing subscription without modification
        SELECT jsonb_build_object(
            'id', id,
            'plan_name', plan_name,
            'status', status,
            'is_new', false,
            'message', 'Existing subscription found'
        ) INTO v_result
        FROM subscriptions
        WHERE id = v_existing_id;

        RETURN v_result;
    END IF;

    -- No existing active subscription - create new
    INSERT INTO subscriptions (
        user_id,
        plan_name,
        plan_duration,
        amount,
        status,
        properties_limit,
        start_date,
        end_date
    ) VALUES (
        p_user_id,
        p_plan_name,
        p_plan_duration,
        p_amount,
        'active',
        p_properties_limit,
        p_start_date,
        p_end_date
    )
    RETURNING jsonb_build_object(
        'id', id,
        'plan_name', plan_name,
        'status', status,
        'is_new', true,
        'message', 'New subscription created'
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_or_create_subscription(UUID, TEXT, TEXT, NUMERIC, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_or_create_subscription(UUID, TEXT, TEXT, NUMERIC, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ) TO anon;

-- 4. Add trigger to prevent downgrades from paid to free
CREATE OR REPLACE FUNCTION prevent_subscription_downgrade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if there's an existing paid subscription
    IF EXISTS (
        SELECT 1 FROM subscriptions
        WHERE user_id = NEW.user_id
          AND id != NEW.id
          AND status = 'active'
          AND amount > 0  -- Paid plan
          AND end_date > NOW()
    ) AND NEW.amount = 0 THEN  -- Trying to create free plan
        -- Skip the insert, return the existing paid subscription instead
        RAISE NOTICE 'Cannot create free subscription while paid subscription is active';
        RETURN NULL;
    END IF;

    RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS prevent_downgrade_trigger ON subscriptions;

-- Create trigger (optional - can be enabled if needed)
-- CREATE TRIGGER prevent_downgrade_trigger
--     BEFORE INSERT ON subscriptions
--     FOR EACH ROW
--     EXECUTE FUNCTION prevent_subscription_downgrade();

-- ============================================================================
-- NOTE: Run this migration to fix the duplicate subscription issue
-- After running, the create-free API will fail gracefully if a subscription exists
-- ============================================================================
