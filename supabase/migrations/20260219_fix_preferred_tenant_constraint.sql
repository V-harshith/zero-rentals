-- Fix preferred_tenant constraint to only allow valid values
-- This migration removes 'Any', 'Gents', 'Ladies' and ensures only 'Male', 'Female', 'Couple' are allowed

-- First, update any existing rows with invalid values to valid ones
UPDATE properties
SET preferred_tenant = 'Couple'
WHERE preferred_tenant IN ('Any', 'Gents', 'Ladies', 'Unisex', 'Family') OR preferred_tenant IS NULL;

-- Update PG properties that have 'Couple' to 'Male' (since PG should only be Male/Female)
UPDATE properties
SET preferred_tenant = 'Male'
WHERE property_type = 'PG' AND preferred_tenant = 'Couple';

-- Drop the existing constraint if it exists
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_preferred_tenant_check;

-- Add the new constraint with only valid values
ALTER TABLE properties ADD CONSTRAINT properties_preferred_tenant_check
    CHECK (preferred_tenant IN ('Male', 'Female', 'Couple'));

-- Also update the users table if it has similar constraints
UPDATE users
SET preferred_tenant = 'Couple'
WHERE preferred_tenant IN ('Any', 'Gents', 'Ladies', 'Unisex', 'Family') OR preferred_tenant IS NULL;

-- Drop and recreate constraint on users table if it exists
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_preferred_tenant_check;
ALTER TABLE users ADD CONSTRAINT users_preferred_tenant_check
    CHECK (preferred_tenant IN ('Male', 'Female', 'Couple'));

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_properties_preferred_tenant ON properties(preferred_tenant);
