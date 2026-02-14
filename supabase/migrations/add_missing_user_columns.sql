-- Migration to ensure all user table columns exist
-- Run this in Supabase SQL Editor

-- Add missing columns to users table if they don't exist
DO $$ 
BEGIN
    -- Add status column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='status') THEN
        ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive'));
    END IF;

    -- Add verification_token column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='verification_token') THEN
        ALTER TABLE users ADD COLUMN verification_token TEXT;
    END IF;

    -- Add token_expires_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='token_expires_at') THEN
        ALTER TABLE users ADD COLUMN token_expires_at TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Add email_verified_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='email_verified_at') THEN
        ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Update RLS policies to allow user creation
DROP POLICY IF EXISTS "Users can create their profile" ON users;
CREATE POLICY "Users can create their profile" ON users
  FOR INSERT WITH CHECK (true); -- Allow anyone to insert (signup)

DROP POLICY IF EXISTS "Service role can manage users" ON users;
CREATE POLICY "Service role can manage users" ON users
  FOR ALL USING (true); -- Allow service role full access

-- Create index on verification_token for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
