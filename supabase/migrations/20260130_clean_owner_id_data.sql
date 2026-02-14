-- CRITICAL DATA FIX
-- This script removes the "undefined" strings that are causing the 500 Error

-- 1. Reset any owner_id that is text "undefined" or "null" to actual NULL
UPDATE properties 
SET owner_id = NULL 
WHERE owner_id::text = 'undefined' 
   OR owner_id::text = 'null'
   OR owner_id::text = '';

-- 2. Verify cleanup (Optional - just to be safe)
-- If this runs without error, your data is now clean!
DO $$
BEGIN
  PERFORM owner_id::text FROM properties WHERE owner_id IS NOT NULL;
END $$;
