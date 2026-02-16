-- Migration: Add refunds table with idempotency support
-- Date: 2026-02-16
-- Purpose: Prevent double refund race conditions [PAY-P1-4]

-- =============================================
-- REFUNDS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Payment reference
    payment_id UUID NOT NULL REFERENCES payment_logs(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    -- Refund details
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    currency TEXT DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'cancelled')),
    reason TEXT,

    -- Idempotency key to prevent duplicate refunds
    idempotency_key TEXT UNIQUE NOT NULL,

    -- Razorpay integration
    razorpay_refund_id TEXT UNIQUE,
    razorpay_payment_id TEXT NOT NULL,
    razorpay_status TEXT,
    receipt_url TEXT,
    speed_processed TEXT,
    speed_requested TEXT,

    -- Error tracking
    error_message TEXT,
    razorpay_error_code TEXT,
    failed_at TIMESTAMPTZ,

    -- Audit trail
    processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Metadata for debugging
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Primary lookup by idempotency key (prevents duplicate refunds)
CREATE INDEX IF NOT EXISTS idx_refunds_idempotency_key ON refunds(idempotency_key);

-- Lookup refunds by payment (check for existing refunds)
CREATE INDEX IF NOT EXISTS idx_refunds_payment_id ON refunds(payment_id);

-- Lookup refunds by user
CREATE INDEX IF NOT EXISTS idx_refunds_user_id ON refunds(user_id);

-- Lookup refunds by status (for admin dashboards)
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status) WHERE status IN ('processing', 'completed');

-- Lookup by Razorpay refund ID (for webhook handling)
CREATE INDEX IF NOT EXISTS idx_refunds_razorpay_refund_id ON refunds(razorpay_refund_id) WHERE razorpay_refund_id IS NOT NULL;

-- Lookup by Razorpay payment ID (for webhook handling)
CREATE INDEX IF NOT EXISTS idx_refunds_razorpay_payment_id ON refunds(razorpay_payment_id);

-- Recent refunds first (for admin listing)
CREATE INDEX IF NOT EXISTS idx_refunds_created_at ON refunds(created_at DESC);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

-- Admins can view all refunds
CREATE POLICY "Admins can view all refunds" ON refunds
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Admins can create refunds
CREATE POLICY "Admins can create refunds" ON refunds
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Admins can update refunds (for status updates)
CREATE POLICY "Admins can update refunds" ON refunds
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Users can view their own refunds
CREATE POLICY "Users can view own refunds" ON refunds
    FOR SELECT
    USING (user_id = auth.uid());

-- =============================================
-- UPDATE PAYMENT_LOGS TABLE
-- =============================================

-- Add refund tracking columns to payment_logs if not exists
ALTER TABLE payment_logs
    ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS partially_refunded_at TIMESTAMPTZ;

-- Index for finding refundable payments
CREATE INDEX IF NOT EXISTS idx_payment_logs_refundable ON payment_logs(status, transaction_id)
    WHERE status = 'success';

-- =============================================
-- DATABASE FUNCTION: CHECK REFUND ELIGIBILITY
-- =============================================
CREATE OR REPLACE FUNCTION check_refund_eligibility(p_payment_id UUID)
RETURNS TABLE (
    eligible BOOLEAN,
    payment_amount DECIMAL(10,2),
    total_refunded DECIMAL(10,2),
    remaining_amount DECIMAL(10,2),
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_payment RECORD;
    v_total_refunded DECIMAL(10,2);
BEGIN
    -- Get payment details
    SELECT * INTO v_payment
    FROM payment_logs
    WHERE id = p_payment_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0::DECIMAL(10,2), 0::DECIMAL(10,2), 0::DECIMAL(10,2), 'Payment not found'::TEXT;
        RETURN;
    END IF;

    -- Check payment status
    IF v_payment.status != 'success' THEN
        RETURN QUERY SELECT FALSE, v_payment.amount, 0::DECIMAL(10,2), 0::DECIMAL(10,2),
            ('Payment status is ' || v_payment.status || ', not refundable')::TEXT;
        RETURN;
    END IF;

    -- Calculate total refunded amount
    SELECT COALESCE(SUM(amount), 0) INTO v_total_refunded
    FROM refunds
    WHERE payment_id = p_payment_id
    AND status = 'completed';

    -- Return eligibility info
    RETURN QUERY SELECT
        (v_total_refunded < v_payment.amount),
        v_payment.amount,
        v_total_refunded,
        (v_payment.amount - v_total_refunded),
        CASE
            WHEN v_total_refunded >= v_payment.amount THEN 'Payment fully refunded'
            ELSE 'Payment eligible for refund'
        END::TEXT;
END;
$$;

COMMENT ON FUNCTION check_refund_eligibility IS 'Checks if a payment is eligible for refund and returns refund status';

-- =============================================
-- DATABASE FUNCTION: ATOMIC REFUND CREATION
-- =============================================
CREATE OR REPLACE FUNCTION create_refund_with_lock(
    p_payment_id UUID,
    p_user_id UUID,
    p_amount DECIMAL(10,2),
    p_idempotency_key TEXT,
    p_reason TEXT,
    p_processed_by UUID,
    p_razorpay_payment_id TEXT
)
RETURNS TABLE (
    success BOOLEAN,
    refund_id UUID,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_refund_id UUID;
    v_eligible BOOLEAN;
    v_remaining DECIMAL(10,2);
BEGIN
    -- Check eligibility first
    SELECT eligible, remaining_amount INTO v_eligible, v_remaining
    FROM check_refund_eligibility(p_payment_id);

    IF NOT v_eligible THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, 'Payment not eligible for refund'::TEXT;
        RETURN;
    END IF;

    IF p_amount > v_remaining THEN
        RETURN QUERY SELECT FALSE, NULL::UUID,
            ('Refund amount exceeds remaining refundable amount: ' || v_remaining)::TEXT;
        RETURN;
    END IF;

    -- Try to insert with idempotency key (will fail if duplicate)
    BEGIN
        INSERT INTO refunds (
            payment_id,
            user_id,
            amount,
            idempotency_key,
            reason,
            processed_by,
            razorpay_payment_id,
            status
        ) VALUES (
            p_payment_id,
            p_user_id,
            p_amount,
            p_idempotency_key,
            p_reason,
            p_processed_by,
            p_razorpay_payment_id,
            'processing'
        )
        RETURNING id INTO v_refund_id;

        RETURN QUERY SELECT TRUE, v_refund_id, 'Refund record created successfully'::TEXT;
    EXCEPTION
        WHEN unique_violation THEN
            -- Idempotency key already exists
            SELECT id INTO v_refund_id
            FROM refunds
            WHERE idempotency_key = p_idempotency_key;

            RETURN QUERY SELECT FALSE, v_refund_id, 'Refund already exists with this idempotency key'::TEXT;
    END;
END;
$$;

COMMENT ON FUNCTION create_refund_with_lock IS 'Atomically creates a refund record with idempotency protection';

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON TABLE refunds IS 'Stores refund records with idempotency protection to prevent double refunds';
COMMENT ON COLUMN refunds.idempotency_key IS 'Unique key to prevent duplicate refund processing (race condition protection)';
COMMENT ON COLUMN refunds.status IS 'processing = refund in progress, completed = refund successful, failed = refund failed, cancelled = refund cancelled';
