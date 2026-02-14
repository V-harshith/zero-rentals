-- FINAL ROBUST FIX (Run this to fix 500 error & button loading issue)

-- 1. Attempt to clean "undefined" data safely
-- We cast to text in the WHERE clause to handle both Text and UUID column types
UPDATE properties 
SET owner_id = NULL 
WHERE owner_id::text = 'undefined' 
   OR owner_id::text = 'null'
   OR owner_id::text = '';

-- 2. RESET & FIX RLS POLICIES with Safe Casting
DROP POLICY IF EXISTS "Owners can create properties" ON properties;
DROP POLICY IF EXISTS "Owners can update own properties" ON properties;
DROP POLICY IF EXISTS "Owners can delete own properties" ON properties;
DROP POLICY IF EXISTS "Admins can manage all properties" ON properties;
DROP POLICY IF EXISTS "Anyone can view properties" ON properties;

-- Public Read
CREATE POLICY "Anyone can view properties" ON properties 
  FOR SELECT USING (true);

-- Owners Insert (Safe Cast)
CREATE POLICY "Owners can create properties" ON properties
  FOR INSERT WITH CHECK ( auth.uid()::text = owner_id::text );

-- Owners Update (Safe Cast + Null Check)
CREATE POLICY "Owners can update own properties" ON properties
  FOR UPDATE 
  USING ( owner_id IS NOT NULL AND auth.uid()::text = owner_id::text )
  WITH CHECK ( owner_id IS NOT NULL AND auth.uid()::text = owner_id::text );

-- Owners Delete (Safe Cast + Null Check)
CREATE POLICY "Owners can delete own properties" ON properties
  FOR DELETE 
  USING ( owner_id IS NOT NULL AND auth.uid()::text = owner_id::text );

-- Admins Full Access
CREATE POLICY "Admins can manage all properties" ON properties
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
