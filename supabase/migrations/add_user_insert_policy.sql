-- =============================================
-- Add RLS policy for user signup
-- =============================================

-- Allow authenticated users to insert their own user record during signup
CREATE POLICY "Users can insert their own profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Also add a policy to allow new users to be created during signup
-- This handles the case where the user just signed up via auth
CREATE POLICY "Allow signup user creation" ON users
  FOR INSERT WITH CHECK (
    auth.uid() = id
    OR 
    -- Allow insert if no current user (during signup flow before session is established)
    auth.uid() IS NOT NULL
  );

-- Drop duplicate policy if it exists
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;

-- Final INSERT policy that works for both cases
CREATE POLICY "Users can create their profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);
