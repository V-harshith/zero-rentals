-- =============================================
-- Migration: Atomic Subscription Functions
-- Purpose: Prevent race conditions in subscription creation
-- Issue: #8 - Race condition in subscription creation
-- =============================================

-- =============================================
-- FUNCTION 1: Atomic Subscription Replacement
-- =============================================
-- This function atomically:
-- 1. Acquires advisory lock on user_id (prevents concurrent operations)
-- 2. Checks idempotency (already processed transaction)
-- 3. Cancels existing active subscription with row lock
-- 4. Creates new subscription
-- 5. Logs payment

CREATE OR REPLACE FUNCTION atomic_subscription_replace(
    p_user_id UUID,
    p_plan_name TEXT,
    p_plan_duration TEXT,
    p_amount NUMERIC,
    p_properties_limit INTEGER,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ,
    p_transaction_id TEXT,
    p_triggered_by TEXT DEFAULT 'system'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_subscription_id UUID;
    v_new_subscription_id UUID;
    v_result JSONB;
BEGIN
    -- Acquire advisory lock on user_id to prevent concurrent operations
    -- This prevents race conditions between webhook and manual fulfillment
    PERFORM pg_advisory_xact_lock(hashtextextended('subscription_' || p_user_id::text, 0));

    -- Check if this transaction was already processed (idempotency)
    IF EXISTS (
        SELECT 1 FROM payment_logs
        WHERE transaction_id = p_transaction_id
        AND status = 'success'
    ) THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'message', 'Transaction already processed'
        );
    END IF;

    -- Get existing active subscription with row lock
    SELECT id INTO v_old_subscription_id
    FROM subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
    FOR UPDATE;

    -- Cancel existing subscription if found
    IF v_old_subscription_id IS NOT NULL THEN
        UPDATE subscriptions
        SET status = 'cancelled',
            updated_at = NOW()
        WHERE id = v_old_subscription_id;
    END IF;

    -- Create new subscription
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
    RETURNING id INTO v_new_subscription_id;

    -- Create payment log entry
    INSERT INTO payment_logs (
        user_id,
        subscription_id,
        amount,
        currency,
        plan_name,
        transaction_id,
        status,
        payment_gateway
    ) VALUES (
        p_user_id,
        v_new_subscription_id,
        p_amount,
        'INR',
        p_plan_name,
        p_transaction_id,
        'success',
        'razorpay'
    );

    RETURN jsonb_build_object(
        'success', true,
        'subscription_id', v_new_subscription_id,
        'previous_subscription_id', v_old_subscription_id,
        'action', CASE WHEN v_old_subscription_id IS NULL THEN 'create' ELSE 'replace' END
    );

EXCEPTION
    WHEN unique_violation THEN
        -- Another process created the subscription concurrently
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Concurrent subscription creation detected',
            'code', 'CONCURRENT_CREATION'
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'code', SQLSTATE
        );
END;
$$;

-- Add comment
COMMENT ON FUNCTION atomic_subscription_replace IS 'Atomically replaces a user subscription with proper locking. Prevents race conditions during concurrent webhook processing.';

-- =============================================
-- FUNCTION 2: Atomic Handle Cancelled to Renewed
-- =============================================
-- This function handles the state machine transition for cancelled -> renewed
-- Used when a user renews before their cancelled subscription expires

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
            end_date = p_end_date,
            updated_at = NOW()
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

COMMENT ON FUNCTION atomic_handle_cancelled_to_renewed IS 'Handles cancelled to renewed transition with proper locking. Prevents duplicate subscriptions during renewal.';
