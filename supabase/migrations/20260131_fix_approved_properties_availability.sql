-- Fix existing approved properties that are missing availability
-- This migration addresses the production issue where approved properties
-- don't show up because they have status='active' but availability is NULL or incorrect

-- Update all active properties to have availability = 'Available'
UPDATE properties
SET 
  availability = 'Available',
  updated_at = NOW()
WHERE 
  status = 'active'
  AND (availability IS NULL OR availability != 'Available');

-- Verify the fix
-- This should return 0 rows after the migration
SELECT id, title, status, availability, created_at
FROM properties
WHERE status = 'active'
  AND (availability IS NULL OR availability != 'Available');
