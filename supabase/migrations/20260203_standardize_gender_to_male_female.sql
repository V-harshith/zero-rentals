-- Migration to standardize gender values to Male/Female/Couple
-- This reverts the previous Boys/Girls migration and standardizes to Male/Female
-- Date: 2026-02-03

-- Step 1: Drop the existing CHECK constraint if it exists
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_preferred_tenant_check;

-- Step 2: Update preferred_tenant values from Boys/Girls to Male/Female
UPDATE properties 
SET preferred_tenant = CASE 
  WHEN preferred_tenant = 'Boys' THEN 'Male'
  WHEN preferred_tenant = 'Girls' THEN 'Female'
  WHEN preferred_tenant = 'boys' THEN 'Male'
  WHEN preferred_tenant = 'girls' THEN 'Female'
  WHEN preferred_tenant = 'Couple' THEN 'Couple'
  WHEN preferred_tenant = 'couple' THEN 'Couple'
  WHEN preferred_tenant = 'Any' THEN 'Couple'
  -- Keep existing Male/Female values
  ELSE preferred_tenant
END
WHERE preferred_tenant IN ('Boys', 'Girls', 'boys', 'girls', 'couple', 'Any');

-- Step 3: Add new CHECK constraint accepting Male, Female, Couple, or NULL
ALTER TABLE properties 
ADD CONSTRAINT properties_preferred_tenant_check 
CHECK (preferred_tenant IN ('Male', 'Female', 'Couple') OR preferred_tenant IS NULL);

-- Step 4: Add comment for future reference
COMMENT ON COLUMN properties.preferred_tenant IS 'Preferred tenant gender: Male, Female, or Couple';
