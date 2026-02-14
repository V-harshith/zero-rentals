-- Migration: Add property payment tracking
-- This allows paid users to purchase additional property slots

-- Add payment tracking columns to properties table
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'included' 
  CHECK (payment_status IN ('included', 'paid', 'expired')),
ADD COLUMN IF NOT EXISTS payment_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_transaction_id TEXT,
ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS payment_plan TEXT;

-- payment_status values:
-- 'included' = first property (included in subscription plan)
-- 'paid' = additional property with separate payment
-- 'expired' = payment expired, needs renewal

-- Create index for expiry checks (for cron job performance)
CREATE INDEX IF NOT EXISTS idx_properties_payment_expiry 
ON properties(payment_expires_at) 
WHERE payment_status = 'paid';

-- Update existing properties to 'included' status (they are the first property)
UPDATE properties 
SET payment_status = 'included' 
WHERE payment_status IS NULL;

COMMENT ON COLUMN properties.payment_status IS 'included = first property, paid = additional paid property, expired = payment expired';
COMMENT ON COLUMN properties.payment_expires_at IS 'Expiry date for paid additional properties';
COMMENT ON COLUMN properties.payment_transaction_id IS 'Razorpay transaction ID for payment verification';
COMMENT ON COLUMN properties.payment_plan IS 'Duration plan: 1_month, 3_months, 6_months, 12_months';
