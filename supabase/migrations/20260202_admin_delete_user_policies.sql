-- Migration: Add RLS policies for admin user deletion
-- Created: 2026-02-02

-- ============================================
-- ADMIN USER DELETION POLICIES
-- ============================================

-- Policy: Allow admins to delete any user from users table
DROP POLICY IF EXISTS "Admins can delete any user" ON users;
CREATE POLICY "Admins can delete any user"
ON users
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users AS admin_user
    WHERE admin_user.id = auth.uid()
    AND admin_user.role = 'admin'
  )
);

-- Policy: Allow admins to delete any user's properties
DROP POLICY IF EXISTS "Admins can delete any property" ON properties;
CREATE POLICY "Admins can delete any property"
ON properties
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Policy: Allow admins to delete any subscription
DROP POLICY IF EXISTS "Admins can delete any subscription" ON subscriptions;
CREATE POLICY "Admins can delete any subscription"
ON subscriptions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- ============================================
-- VERIFICATION
-- ============================================

-- Verify policies are created
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE policyname LIKE '%Admins can delete%'
ORDER BY tablename, policyname;

-- ============================================
-- NOTES
-- ============================================

-- These policies allow admin users to delete:
-- 1. User accounts from the users table
-- 2. Properties owned by any user
-- 3. Subscriptions for any user

-- Note: Favorites are automatically deleted via cascade when user is deleted
-- No separate admin interface needed for managing favorites

-- The API endpoint handles the actual deletion logic
-- and prevents admins from deleting themselves

-- Cascade deletion is handled at the application level
-- in the API endpoint to ensure proper cleanup
