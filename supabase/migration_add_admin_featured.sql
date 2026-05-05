-- Migration: Add admin_featured column to properties table
-- Run this in your Supabase SQL Editor

-- Add the admin_featured column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'properties' 
        AND column_name = 'admin_featured'
    ) THEN
        ALTER TABLE properties ADD COLUMN admin_featured BOOLEAN NOT NULL DEFAULT FALSE;
        RAISE NOTICE 'Added admin_featured column to properties table';
    ELSE
        RAISE NOTICE 'admin_featured column already exists';
    END IF;
END $$;

-- Create index for fast filtering if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_properties_admin_featured'
    ) THEN
        CREATE INDEX idx_properties_admin_featured ON properties(admin_featured) WHERE admin_featured = TRUE;
        RAISE NOTICE 'Created idx_properties_admin_featured index';
    ELSE
        RAISE NOTICE 'idx_properties_admin_featured index already exists';
    END IF;
END $$;

-- Update RLS policies to include admin_featured if needed
-- (The existing policies should work since admin_featured has a default value)

-- Optional: Migrate existing data
-- If you previously used 'featured' for admin picks, you may want to migrate:
-- UPDATE properties SET admin_featured = TRUE WHERE featured = TRUE AND owner_id IN (
--     SELECT id FROM users WHERE role = 'admin'
-- );
