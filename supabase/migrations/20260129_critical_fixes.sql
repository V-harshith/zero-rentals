-- Migration: Add unique constraint to prevent duplicate payments and create view increment function
-- Date: 2026-01-29

-- 1. Add unique constraint on transaction_id to prevent race condition in webhook
ALTER TABLE payment_logs 
ADD CONSTRAINT payment_logs_transaction_id_unique UNIQUE (transaction_id);

-- 2. Create function to safely increment property views
CREATE OR REPLACE FUNCTION increment_property_views(property_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE properties
    SET views = COALESCE(views, 0) + 1
    WHERE id = property_id;
END;
$$;

-- 3. Add index on payment_logs for faster idempotency checks
CREATE INDEX IF NOT EXISTS idx_payment_logs_transaction_id 
ON payment_logs(transaction_id);

-- 4. Add index on subscriptions for faster active subscription lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status_active 
ON subscriptions(user_id, status, end_date) 
WHERE status = 'active';

-- 5. Add check constraint to ensure end_date is after start_date
ALTER TABLE subscriptions 
ADD CONSTRAINT subscriptions_end_date_after_start 
CHECK (end_date > start_date);

COMMENT ON CONSTRAINT payment_logs_transaction_id_unique ON payment_logs IS 
'Prevents duplicate payment processing from webhook race conditions';

COMMENT ON FUNCTION increment_property_views IS 
'Safely increments property view count without race conditions';
