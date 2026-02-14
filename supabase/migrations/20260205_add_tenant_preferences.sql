-- Add tenant preference fields to users table
-- Migration: 20260205_add_tenant_preferences.sql
-- Purpose: Allow tenants to specify their preferred city and area for property searches

-- Add preferred_city column (nullable - optional for tenants)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS preferred_city TEXT;

-- Add preferred_area column (nullable - optional for tenants)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS preferred_area TEXT;

-- Add comment for documentation
COMMENT ON COLUMN users.preferred_city IS 'Tenant preferred city for property search';
COMMENT ON COLUMN users.preferred_area IS 'Tenant preferred area/locality for property search';

-- Create index for faster filtering on tenant exports
CREATE INDEX IF NOT EXISTS idx_users_preferred_city ON users(preferred_city) WHERE preferred_city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_preferred_area ON users(preferred_area) WHERE preferred_area IS NOT NULL;
