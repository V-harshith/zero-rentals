-- =============================================
-- Migration: Fix Atomic Subscription Renewed
-- Purpose: Fix race condition in subscription renewal when a user has multiple active subscriptions by enforcing LIMIT 1 and remove updated_at column dependency
-- =============================================

CREATE OR REPLACE FUNCTION atomic_handle_cancelled_to_renewed(
    p_user_id UUID,
    p_plan_name TEXT,
    p_plan_duration TEXT,
    p_amount NUMERIC,
    p_properties_limit INTEGER,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ,
    p_transaction_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_existing_sub RECORD;
    v_subscription_id UUID;
BEGIN
    -- Acquire advisory lock
    PERFORM pg_advisory_xact_lock(hashtextextended('subscription_' || p_user_id::text, 0));

    -- Check for existing subscription
    SELECT id, status, end_date, plan_name
    INTO v_existing_sub
    FROM subscriptions
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    -- Handle based on existing subscription state
    IF FOUND AND v_existing_sub.status = 'cancelled' AND v_existing_sub.end_date > NOW() THEN
        -- Reactivate cancelled subscription
        UPDATE subscriptions
        SET status = 'active',
            plan_name = p_plan_name,
            plan_duration = p_plan_duration,
            amount = p_amount,
            properties_limit = p_properties_limit,
            start_date = p_start_date,
            end_date = p_end_date
        WHERE id = v_existing_sub.id;

        v_subscription_id := v_existing_sub.id;

        RETURN jsonb_build_object(
            'success', true,
            'subscription_id', v_subscription_id,
            'action', 'reactivate'
        );
    ELSIF FOUND AND v_existing_sub.status = 'active' THEN
        -- Already has active subscription - this is a duplicate
        RETURN jsonb_build_object(
            'success', true,
            'subscription_id', v_existing_sub.id,
            'action', 'existing',
            'message', 'Active subscription already exists'
        );
    ELSE
        -- No existing or expired - create new subscription
        INSERT INTO subscriptions (
            user_id, plan_name, plan_duration, amount, status,
            properties_limit, start_date, end_date
        ) VALUES (
            p_user_id, p_plan_name, p_plan_duration, p_amount, 'active',
            p_properties_limit, p_start_date, p_end_date
        )
        RETURNING id INTO v_subscription_id;

        RETURN jsonb_build_object(
            'success', true,
            'subscription_id', v_subscription_id,
            'action', 'create_new'
        );
    END IF;
END;
$$;
