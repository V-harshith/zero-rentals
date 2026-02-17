-- ============================================================================
-- CRITICAL FIX: Timezone Issue in Subscription Dates
-- ============================================================================
-- Issue: Subscriptions created with local server time instead of UTC
-- This caused subscriptions to appear expired earlier than expected
--
-- This migration:
-- 1. Extends end_date for recent subscriptions by 1 day as a safety buffer
-- 2. Ensures all future subscriptions use UTC dates
-- ============================================================================

-- Step 1: Add a 1-day buffer to subscriptions created in the last 7 days
-- This compensates for any timezone issues that may have caused early expiration
UPDATE subscriptions
SET end_date = end_date + INTERVAL '1 day',
    updated_at = NOW()
WHERE status = 'active'
  AND created_at > NOW() - INTERVAL '7 days'
  AND end_date > NOW();  -- Only extend if not already expired

-- Step 2: Log the affected subscriptions for audit
-- (This will be visible in the migration output)
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM subscriptions
    WHERE status = 'active'
      AND created_at > NOW() - INTERVAL '7 days'
      AND end_date > NOW() + INTERVAL '1 day';  -- After the update

    RAISE NOTICE 'Extended end_date for % recent subscriptions by 1 day', v_count;
END $$;

-- Step 3: Create a function to properly calculate subscription end dates in UTC
-- This can be used by the application to ensure consistent date calculations
CREATE OR REPLACE FUNCTION calculate_subscription_end_date(
    p_duration TEXT,
    p_start_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_end_date TIMESTAMPTZ;
    v_months INTEGER;
    v_years INTEGER;
BEGIN
    -- Parse duration (e.g., '1 month', '3 months', '1 year')
    IF p_duration ILIKE '%month%' THEN
        v_months := COALESCE((regexp_match(p_duration, '(\d+)'))[1]::INTEGER, 1);
        v_end_date := p_start_date + (v_months || ' months')::INTERVAL;
    ELSIF p_duration ILIKE '%year%' THEN
        v_years := COALESCE((regexp_match(p_duration, '(\d+)'))[1]::INTEGER, 1);
        v_end_date := p_start_date + (v_years || ' years')::INTERVAL;
    ELSE
        -- Default to 1 month
        v_end_date := p_start_date + INTERVAL '1 month';
    END IF;

    RETURN v_end_date;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_subscription_end_date(TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_subscription_end_date(TEXT, TIMESTAMPTZ) TO anon;

-- Step 4: Add comment explaining the fix
COMMENT ON FUNCTION calculate_subscription_end_date IS
    'Calculates subscription end date in UTC. Use this instead of client-side date calculations to ensure consistency.';

-- ============================================================================
-- Verification query (run manually to check status):
--
-- SELECT
--     id,
--     user_id,
--     plan_name,
--     status,
--     start_date,
--     end_date,
--     NOW() as current_time,
--     end_date - NOW() as time_remaining
-- FROM subscriptions
-- WHERE status = 'active'
-- ORDER BY created_at DESC
-- LIMIT 10;
-- ============================================================================
