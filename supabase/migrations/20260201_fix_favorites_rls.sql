-- Fix RLS policies for favorites table
-- This ensures users can delete their own favorites

-- STEP 1: Drop ALL existing policies first (before altering column type)
-- These are the exact policy names from the database
DROP POLICY IF EXISTS "Users can add favorites" ON favorites;
DROP POLICY IF EXISTS "Users can delete own favorites" ON favorites;
DROP POLICY IF EXISTS "Users can remove favorites" ON favorites;
DROP POLICY IF EXISTS "Users can view their own favorites" ON favorites;

-- STEP 2: Convert column to uuid type
ALTER TABLE favorites
  ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

-- STEP 3: Enable RLS
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- STEP 4: Create new RLS policies with correct types
CREATE POLICY "Users can view their own favorites"
  ON favorites
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can add their own favorites"
  ON favorites
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete their own favorites"
  ON favorites
  FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- STEP 5: Grant permissions
GRANT SELECT, INSERT, DELETE ON favorites TO authenticated;
