-- ============================================================================
-- CRITICAL FIX: Prevent duplicate subscriptions per user
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Step 1: Clean up duplicate subscriptions (keep the most recent active one)
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

-- Step 2: Add unique constraint on user_id for active subscriptions
DROP INDEX IF EXISTS idx_unique_active_user_subscription;
CREATE UNIQUE INDEX idx_unique_active_user_subscription
ON subscriptions(user_id)
WHERE status = 'active';

-- Step 3: Create function to safely get or create subscription
DROP FUNCTION IF EXISTS get_or_create_subscription(UUID, TEXT, TEXT, NUMERIC, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ);

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
    FOR UPDATE SKIP LOCKED;

    IF v_existing_id IS NOT NULL THEN
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

-- Step 4: Create trigger function to prevent downgrades from paid to free
CREATE OR REPLACE FUNCTION prevent_subscription_downgrade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM subscriptions
        WHERE user_id = NEW.user_id
          AND id != NEW.id
          AND status = 'active'
          AND amount > 0
          AND end_date > NOW()
    ) AND NEW.amount = 0 THEN
        RAISE NOTICE 'Cannot create free subscription while paid subscription is active';
        RETURN NULL;
    END IF;

    RETURN NEW;
END;
$$;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS prevent_downgrade_trigger ON subscriptions;

-- Enable the trigger
CREATE TRIGGER prevent_downgrade_trigger
    BEFORE INSERT ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION prevent_subscription_downgrade();

-- Done!
