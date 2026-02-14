-- Migration: Add '1RK' to room_type CHECK constraint
-- This fixes the "failed to update property" error when editing 1RK properties

-- Step 1: Drop the existing CHECK constraint
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_room_type_check;

-- Step 2: Add the updated CHECK constraint including '1RK'
ALTER TABLE properties ADD CONSTRAINT properties_room_type_check
  CHECK (room_type IN ('Single', 'Double', 'Triple', 'Four Sharing', 'Apartment', '1RK'));

-- Step 3: Update any existing properties that might have '1rk' (lowercase) to '1RK'
UPDATE properties
SET room_type = '1RK'
WHERE LOWER(room_type) = '1rk';

-- Verification query (run manually to check)
-- SELECT DISTINCT room_type FROM properties;
