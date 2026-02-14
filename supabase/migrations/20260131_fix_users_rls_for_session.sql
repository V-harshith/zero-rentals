-- Fix user table RLS policy for session persistence
-- This allows users to read their own profile immediately after authentication

-- Drop existing policy
DROP POLICY IF EXISTS "Users can view their own data" ON users;

-- Create new policy that allows authenticated users to read their own data
-- by checking if their auth.uid() matches the user id
CREATE POLICY "Users can view their own data" ON users
  FOR SELECT 
  TO authenticated
  USING (auth.uid() = id);

-- Also add a policy to allow users to read other users' basic info (needed for property listings)
CREATE POLICY "Authenticated users can view public user info" ON users
  FOR SELECT
  TO authenticated
  USING (true);
