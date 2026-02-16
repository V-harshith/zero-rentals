-- Fix existing users who have email_verified_at set but verified is not true
-- This ensures the export data shows correct verification status

UPDATE users
SET verified = true
WHERE email_verified_at IS NOT NULL
  AND (verified IS NULL OR verified = false);

-- Add comment explaining the verification logic
COMMENT ON COLUMN users.verified IS 'Boolean flag indicating email verification status. Both verified=true AND email_verified_at IS NULL required for full verification.';

-- Create index for efficient verification queries
CREATE INDEX IF NOT EXISTS idx_users_verified_status
ON users(verified, email_verified_at)
WHERE verified = true OR email_verified_at IS NOT NULL;
