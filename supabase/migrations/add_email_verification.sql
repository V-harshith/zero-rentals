-- Add email verification columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS verification_token TEXT,
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_users_verification_token 
ON users(verification_token) 
WHERE verification_token IS NOT NULL;

-- Update existing users to be verified (migration only)
UPDATE users 
SET email_verified_at = NOW() 
WHERE email_verified_at IS NULL;

-- Add comment
COMMENT ON COLUMN users.verification_token IS 'Token for email verification';
COMMENT ON COLUMN users.token_expires_at IS 'Expiry time for verification token (24 hours)';
COMMENT ON COLUMN users.email_verified_at IS 'Timestamp when email was verified';
