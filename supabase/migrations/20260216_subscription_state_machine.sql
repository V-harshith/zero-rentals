-- ============================================
-- Subscription State Machine Migration
-- [PAY-P1-2] Fix Cancelled -> Renewed transition
-- ============================================

-- 1. Create subscription_transitions table for audit logging
CREATE TABLE IF NOT EXISTS subscription_transitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_status TEXT NOT NULL CHECK (from_status IN ('active', 'expired', 'cancelled')),
    to_status TEXT NOT NULL CHECK (to_status IN ('active', 'expired', 'cancelled')),
    transition_type TEXT CHECK (transition_type IN ('create', 'renew', 'expire', 'cancel', 'reactivate')),
    reason TEXT NOT NULL,
    triggered_by TEXT NOT NULL CHECK (triggered_by IN ('user', 'system', 'cron', 'webhook', 'admin')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscription_transitions_subscription_id
ON subscription_transitions(subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscription_transitions_user_id
ON subscription_transitions(user_id);

CREATE INDEX IF NOT EXISTS idx_subscription_transitions_created_at
ON subscription_transitions(created_at);

-- 3. Add RLS policies for subscription_transitions
ALTER TABLE subscription_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscription transitions"
ON subscription_transitions FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Service role can manage subscription transitions"
ON subscription_transitions FOR ALL
USING (true)
WITH CHECK (true);

-- 4. Create function to validate state transitions
CREATE OR REPLACE FUNCTION validate_subscription_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Same status is always allowed (idempotent updates)
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Define valid transitions
    CASE OLD.status
        WHEN 'active' THEN
            IF NEW.status NOT IN ('expired', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid transition: active -> %', NEW.status;
            END IF;
        WHEN 'expired' THEN
            -- Expired is terminal - no transitions allowed
            RAISE EXCEPTION 'Invalid transition: expired -> % (expired is terminal)', NEW.status;
        WHEN 'cancelled' THEN
            IF NEW.status NOT IN ('expired', 'active') THEN
                RAISE EXCEPTION 'Invalid transition: cancelled -> %', NEW.status;
            END IF;
        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger for state transition validation
DROP TRIGGER IF EXISTS validate_subscription_status_transition ON subscriptions;
CREATE TRIGGER validate_subscription_status_transition
    BEFORE UPDATE OF status ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION validate_subscription_transition();

-- 6. Create function to auto-log transitions
CREATE OR REPLACE FUNCTION log_subscription_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if status actually changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO subscription_transitions (
            subscription_id,
            user_id,
            from_status,
            to_status,
            transition_type,
            reason,
            triggered_by,
            metadata
        ) VALUES (
            NEW.id,
            NEW.user_id,
            OLD.status,
            NEW.status,
            CASE
                WHEN OLD.status IS NULL THEN 'create'
                WHEN OLD.status = 'active' AND NEW.status = 'expired' THEN 'expire'
                WHEN OLD.status = 'active' AND NEW.status = 'cancelled' THEN 'cancel'
                WHEN OLD.status = 'cancelled' AND NEW.status = 'expired' THEN 'expire'
                WHEN OLD.status = 'cancelled' AND NEW.status = 'active' THEN 'reactivate'
                WHEN OLD.status = 'expired' AND NEW.status = 'active' THEN 'renew'
                ELSE 'unknown'
            END,
            COALESCE(NEW.transition_reason, 'Status changed from ' || OLD.status || ' to ' || NEW.status),
            COALESCE(NEW.transition_triggered_by, 'system'),
            COALESCE(NEW.transition_metadata, '{}'::jsonb)
        );

        -- Clear the transition metadata fields after logging
        NEW.transition_reason := NULL;
        NEW.transition_triggered_by := NULL;
        NEW.transition_metadata := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Add temporary columns for transition metadata (used by trigger)
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS transition_reason TEXT,
ADD COLUMN IF NOT EXISTS transition_triggered_by TEXT CHECK (transition_triggered_by IN ('user', 'system', 'cron', 'webhook', 'admin')),
ADD COLUMN IF NOT EXISTS transition_metadata JSONB DEFAULT '{}'::jsonb;

-- 8. Create trigger for auto-logging
DROP TRIGGER IF EXISTS log_subscription_transition_trigger ON subscriptions;
CREATE TRIGGER log_subscription_transition_trigger
    AFTER UPDATE OF status ON subscriptions
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION log_subscription_transition();

-- 9. Create view for subscription status summary
CREATE OR REPLACE VIEW subscription_status_summary AS
SELECT
    s.id,
    s.user_id,
    s.plan_name,
    s.status,
    s.start_date,
    s.end_date,
    s.created_at,
    s.updated_at,
    COUNT(st.id) AS transition_count,
    MAX(st.created_at) AS last_transition_at
FROM subscriptions s
LEFT JOIN subscription_transitions st ON s.id = st.subscription_id
GROUP BY s.id, s.user_id, s.plan_name, s.status, s.start_date, s.end_date, s.created_at, s.updated_at;

-- 10. Add comment explaining the state machine
COMMENT ON TABLE subscriptions IS 'Subscription state machine: active -> [expired|cancelled], cancelled -> [expired|active], expired -> [] (terminal)';
COMMENT ON TABLE subscription_transitions IS 'Audit log of all subscription status changes';
COMMENT ON COLUMN subscriptions.status IS 'Subscription status: active, expired, or cancelled. See VALID_STATE_TRANSITIONS for allowed changes.';

-- ============================================
-- Fix existing data issues
-- ============================================

-- Mark any subscriptions past end_date as expired (if not already)
UPDATE subscriptions
SET
    status = 'expired',
    transition_reason = 'Auto-expired by migration: end_date passed',
    transition_triggered_by = 'system'
WHERE
    status IN ('active', 'cancelled')
    AND end_date < NOW();

-- Verify: Show any invalid state transitions that would fail
SELECT
    id,
    user_id,
    status,
    end_date,
    'Subscription past end_date but not expired' as issue
FROM subscriptions
WHERE
    status IN ('active', 'cancelled')
    AND end_date < NOW();
