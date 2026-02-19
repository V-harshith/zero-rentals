-- =============================================
-- Migration: Create webhook_events table
-- Purpose: Store and track Razorpay webhook events for idempotency,
--          event sequencing, and reliable processing
-- Issue: #7 - Missing webhook_events table
-- =============================================

-- Create the webhook_events table
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Razorpay event ID for idempotency (unique per Razorpay event)
    event_id TEXT UNIQUE NOT NULL,

    -- Event type from Razorpay (e.g., 'order.paid', 'subscription.created')
    event_type TEXT NOT NULL,

    -- Processing status
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

    -- Full webhook payload as JSONB
    payload JSONB NOT NULL,

    -- Event sequence number for ordering (lower = earlier in lifecycle)
    sequence_number INTEGER DEFAULT 999,

    -- Entity ID for grouping related events (subscription_id, order_id, etc.)
    entity_id TEXT,

    -- Error message if processing failed
    error TEXT,

    -- Timestamps
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================

-- For idempotency checks (event_id lookups)
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id
ON webhook_events(event_id);

-- For event sequencing queries (finding pending events by entity)
CREATE INDEX IF NOT EXISTS idx_webhook_events_entity_status
ON webhook_events(entity_id, status, sequence_number)
WHERE entity_id IS NOT NULL;

-- For finding pending events that can now be processed
CREATE INDEX IF NOT EXISTS idx_webhook_events_entity_pending
ON webhook_events(entity_id, sequence_number)
WHERE status IN ('pending', 'processing', 'failed');

-- For querying by event type
CREATE INDEX IF NOT EXISTS idx_webhook_events_type
ON webhook_events(event_type);

-- For querying by status (useful for monitoring/retry)
CREATE INDEX IF NOT EXISTS idx_webhook_events_status_created
ON webhook_events(status, created_at);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Only service role can access webhook_events (no user access needed)
CREATE POLICY "Service role can manage webhook events"
    ON webhook_events
    USING (true)
    WITH CHECK (true);

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON TABLE webhook_events IS 'Stores Razorpay webhook events for idempotency, sequencing, and reliable processing';
COMMENT ON COLUMN webhook_events.event_id IS 'Razorpay event ID for idempotency (unique per event)';
COMMENT ON COLUMN webhook_events.event_type IS 'Type of webhook event from Razorpay';
COMMENT ON COLUMN webhook_events.status IS 'Current processing status: pending, processing, completed, failed';
COMMENT ON COLUMN webhook_events.sequence_number IS 'Event sequence number for ordering (lower = earlier in lifecycle)';
COMMENT ON COLUMN webhook_events.entity_id IS 'Entity identifier for grouping related events (subscription_id, order_id, etc.)';
COMMENT ON COLUMN webhook_events.payload IS 'Full webhook payload as JSONB';
COMMENT ON COLUMN webhook_events.error IS 'Error message if processing failed';
COMMENT ON COLUMN webhook_events.processed_at IS 'Timestamp when event was processed (completed or failed)';
