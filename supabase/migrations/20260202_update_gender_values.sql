-- Migration to update gender preference values
-- From: Male/Female/Any
-- To: Boys/Girls/Couple

-- Update preferred_tenant values
UPDATE properties 
SET preferred_tenant = CASE 
  WHEN preferred_tenant = 'Male' THEN 'Boys'
  WHEN preferred_tenant = 'Female' THEN 'Girls'
  WHEN preferred_tenant = 'Any' THEN 'Couple'
  WHEN preferred_tenant = 'male' THEN 'Boys'
  WHEN preferred_tenant = 'female' THEN 'Girls'
  WHEN preferred_tenant = 'anyone' THEN 'Couple'
  ELSE preferred_tenant
END
WHERE preferred_tenant IN ('Male', 'Female', 'Any', 'male', 'female', 'anyone');

-- Note: For PG and Rent properties, 'Couple' should be changed to 'Boys' or 'Girls'
-- This will need to be handled in application logic or manually reviewed
