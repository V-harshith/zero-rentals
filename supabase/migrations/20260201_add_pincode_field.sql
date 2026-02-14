-- Migration: Add Pincode Field for Enhanced Location Search
-- Description: Add pincode column to properties table with indexes for industry-standard location search
-- Created: 2026-02-01
-- Backward Compatible: Yes (nullable column, no data loss)

-- ============================================================================
-- ADD PINCODE COLUMN
-- ============================================================================

-- Add pincode column (nullable for backward compatibility)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS pincode TEXT;

-- Add comment
COMMENT ON COLUMN properties.pincode IS 'Postal code for property location (6 digits for India)';

-- ============================================================================
-- ADD INDEXES FOR OPTIMIZED SEARCH
-- ============================================================================

-- Index for pincode searches (exact match)
CREATE INDEX IF NOT EXISTS idx_properties_pincode 
ON properties(pincode) 
WHERE pincode IS NOT NULL;

-- Composite index for multi-field location searches
CREATE INDEX IF NOT EXISTS idx_properties_location_search 
ON properties(city, area, pincode) 
WHERE status = 'active' AND availability = 'Available';

-- Index for locality searches (if locality is used)
CREATE INDEX IF NOT EXISTS idx_properties_locality 
ON properties(locality) 
WHERE locality IS NOT NULL;

-- ============================================================================
-- VALIDATION FUNCTION (Optional but recommended)
-- ============================================================================

-- Function to validate Indian pincode format
CREATE OR REPLACE FUNCTION validate_pincode(pincode_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Allow NULL (optional field)
  IF pincode_value IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Check if it's exactly 6 digits
  RETURN pincode_value ~ '^\d{6}$';
END;
$$;

-- Add check constraint for pincode validation
ALTER TABLE properties
DROP CONSTRAINT IF EXISTS check_pincode_format;

ALTER TABLE properties
ADD CONSTRAINT check_pincode_format
CHECK (validate_pincode(pincode));

COMMENT ON FUNCTION validate_pincode(TEXT) IS 'Validates Indian pincode format (6 digits)';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check if column was added successfully
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'properties' 
    AND column_name = 'pincode'
  ) THEN
    RAISE NOTICE '✅ Pincode column added successfully';
  ELSE
    RAISE EXCEPTION '❌ Failed to add pincode column';
  END IF;
END $$;

-- Check indexes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM pg_indexes 
    WHERE tablename = 'properties' 
    AND indexname = 'idx_properties_pincode'
  ) THEN
    RAISE NOTICE '✅ Pincode index created successfully';
  END IF;
  
  IF EXISTS (
    SELECT 1 
    FROM pg_indexes 
    WHERE tablename = 'properties' 
    AND indexname = 'idx_properties_location_search'
  ) THEN
    RAISE NOTICE '✅ Location search index created successfully';
  END IF;
END $$;

-- ============================================================================
-- MONITORING QUERY
-- ============================================================================

-- Use this to check pincode distribution after data is added:
/*
SELECT 
  pincode,
  COUNT(*) as property_count,
  STRING_AGG(DISTINCT city, ', ') as cities
FROM properties
WHERE pincode IS NOT NULL
GROUP BY pincode
ORDER BY property_count DESC
LIMIT 20;
*/
