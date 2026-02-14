-- Fix RLS policies to handle NULL owner_id
-- This fixes the "invalid input syntax for type uuid: undefined" error

-- Drop existing policies
DROP POLICY IF EXISTS "Owners can create properties" ON properties;
DROP POLICY IF EXISTS "Owners can update own properties" ON properties;
DROP POLICY IF EXISTS "Owners can delete own properties" ON properties;
DROP POLICY IF EXISTS "Admins can manage all properties" ON properties;

-- Recreate policies with NULL handling

-- Policy: Property owners can insert their own properties
CREATE POLICY "Owners can create properties" ON properties
  FOR INSERT
  WITH CHECK (
    owner_id IS NOT NULL 
    AND auth.uid()::text = owner_id
  );

-- Policy: Property owners can update their own properties
CREATE POLICY "Owners can update own properties" ON properties
  FOR UPDATE
  USING (
    owner_id IS NOT NULL 
    AND auth.uid()::text = owner_id
  )
  WITH CHECK (
    owner_id IS NOT NULL 
    AND auth.uid()::text = owner_id
  );

-- Policy: Property owners can delete their own properties
CREATE POLICY "Owners can delete own properties" ON properties
  FOR DELETE
  USING (
    owner_id IS NOT NULL 
    AND auth.uid()::text = owner_id
  );

-- Policy: Admins can manage ALL properties (including those with NULL owner_id)
CREATE POLICY "Admins can manage all properties" ON properties
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()::text
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()::text
      AND users.role = 'admin'
    )
  );
