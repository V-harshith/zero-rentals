-- FIXED RLS Policies (UUID Type Compatible)

-- Drop existing policies to ensure clean state
DROP POLICY IF EXISTS "Owners can create properties" ON properties;
DROP POLICY IF EXISTS "Owners can update own properties" ON properties;
DROP POLICY IF EXISTS "Owners can delete own properties" ON properties;
DROP POLICY IF EXISTS "Admins can manage all properties" ON properties;
DROP POLICY IF EXISTS "Anyone can view properties" ON properties;

-- Recreate policies using CORRECT UUID TYPES (No text casting)

-- 1. Public Read Access
CREATE POLICY "Anyone can view properties" ON properties
  FOR SELECT
  USING (true);

-- 2. Owners Insert (Handle NULL safely)
CREATE POLICY "Owners can create properties" ON properties
  FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
  );

-- 3. Owners Update (Handle NULL safely)
CREATE POLICY "Owners can update own properties" ON properties
  FOR UPDATE
  USING (
    owner_id IS NOT NULL 
    AND auth.uid() = owner_id
  )
  WITH CHECK (
    owner_id IS NOT NULL 
    AND auth.uid() = owner_id
  );

-- 4. Owners Delete
CREATE POLICY "Owners can delete own properties" ON properties
  FOR DELETE
  USING (
    owner_id IS NOT NULL 
    AND auth.uid() = owner_id
  );

-- 5. Admin Full Access
-- This uses a subquery to check if the current user is an admin
CREATE POLICY "Admins can manage all properties" ON properties
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
