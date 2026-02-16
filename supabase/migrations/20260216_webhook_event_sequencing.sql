-- Migration: Add webhook event sequencing columns
-- Purpose: Support proper event ordering and idempotency for Razorpay webhooks

-- Add sequence_number column for event ordering
ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS sequence_number INTEGER DEFAULT 999;

-- Add entity_id column to group related events (subscription_id, order_id, etc.)
ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS entity_id TEXT;

-- Add status 'pending' for queued out-of-order events
-- Note: 'pending' status is already covered by existing enum values
-- The status column should already support: 'pending', 'processing', 'completed', 'failed'

-- Create index for efficient event sequencing queries
CREATE INDEX IF NOT EXISTS idx_webhook_events_entity_status
ON webhook_events(entity_id, status, sequence_number)
WHERE entity_id IS NOT NULL;

-- Create index for idempotency checks
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id
ON webhook_events(event_id);

-- Create index for finding pending events by entity
CREATE INDEX IF NOT EXISTS idx_webhook_events_entity_pending
ON webhook_events(entity_id, sequence_number)
WHERE status IN ('pending', 'processing', 'failed');

-- Update existing rows to have a default sequence number based on event type
UPDATE webhook_events
SET sequence_number = CASE event_type
    WHEN 'subscription.created' THEN 1
    WHEN 'subscription.updated' THEN 2
    WHEN 'subscription.charged' THEN 3
    WHEN 'subscription.cancelled' THEN 4
    WHEN 'order.paid' THEN 5
    WHEN 'payment.captured' THEN 6
    WHEN 'payment.failed' THEN 6
    WHEN 'invoice.paid' THEN 7
    WHEN 'invoice.failed' THEN 7
    ELSE 999
END
WHERE sequence_number = 999;

-- Add comment explaining the sequencing system
COMMENT ON COLUMN webhook_events.sequence_number IS 'Event sequence number for ordering (lower = earlier in lifecycle)';
COMMENT ON COLUMN webhook_events.entity_id IS 'Entity identifier for grouping related events (subscription_id, order_id, etc.)';
