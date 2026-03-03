-- Migration: Add pending email change columns to users table
-- Created: 2026-02-20

-- Add columns to track pending email changes
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_change_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_change_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_change_verified BOOLEAN DEFAULT FALSE;

-- Add index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_users_email_change_token ON users(email_change_token);

-- Add index for pending email lookups
CREATE INDEX IF NOT EXISTS idx_users_pending_email ON users(pending_email);
