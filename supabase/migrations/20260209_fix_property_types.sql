-- Migration: Fix wrong property_type values
-- Run this to update properties that should be 'Rent' or 'Co-living' but are incorrectly marked as 'PG'

-- First, let's see what properties might have wrong types
-- Properties with BHK room types (1BHK, 2BHK, etc.) should be 'Rent', not 'PG'

-- Update properties with Apartment room type to 'Rent'
UPDATE properties 
SET property_type = 'Rent'
WHERE property_type = 'PG' 
  AND room_type = 'Apartment';

-- If you need to fix specific property IDs, use this format:
-- UPDATE properties SET property_type = 'Rent' WHERE id = 'your-property-id-here';
-- UPDATE properties SET property_type = 'Co-living' WHERE id = 'your-property-id-here';

-- Example: Fix specific properties by ID (uncomment and add your IDs)
-- UPDATE properties SET property_type = 'Rent' WHERE id IN (
--   'property-id-1',
--   'property-id-2',
--   'property-id-3'
-- );

-- View properties to verify (run as SELECT only)
-- SELECT id, title, property_type, room_type FROM properties WHERE property_type = 'PG';
