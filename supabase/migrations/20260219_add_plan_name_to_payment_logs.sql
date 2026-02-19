-- Migration: Add plan_name column to payment_logs table
-- Issue: Webhook was trying to insert plan_name but column didn't exist
-- This fixes the Razorpay webhook payment recording

-- Add plan_name column to payment_logs table
ALTER TABLE payment_logs
ADD COLUMN IF NOT EXISTS plan_name TEXT;

-- Add comment for documentation
COMMENT ON COLUMN payment_logs.plan_name IS 'Name of the subscription plan (Silver, Gold, Platinum, Elite) for admin dashboard reporting';
