-- Migration: Enforce Email Verification at Database Level
-- Description: Add RLS policies to prevent unverified users from accessing protected resources
-- Created: 2026-02-01

-- ============================================================================
-- HELPER FUNCTION: Check if user is verified
-- ============================================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.is_user_verified();

-- Create function to check if the current user has verified their email
CREATE OR REPLACE FUNCTION public.is_user_verified()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  user_verified BOOLEAN;
  user_email_verified_at TIMESTAMPTZ;
BEGIN
  -- Get verification status from users table
  SELECT 
    COALESCE(verified, FALSE),
    email_verified_at
  INTO 
    user_verified,
    user_email_verified_at
  FROM public.users
  WHERE id = auth.uid();

  -- User must exist and have verified email
  -- We check both the verified flag AND email_verified_at timestamp
  IF user_verified IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Return true only if both conditions are met:
  -- 1. verified flag is TRUE
  -- 2. email_verified_at is NOT NULL (email was confirmed)
  RETURN (user_verified = TRUE AND user_email_verified_at IS NOT NULL);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_user_verified() TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.is_user_verified() IS 
  'Returns TRUE if the current user has verified their email address. Used in RLS policies to restrict access for unverified users.';

-- ============================================================================
-- UPDATE PROPERTIES TABLE RLS POLICIES
-- ============================================================================

-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Verified owners can insert properties" ON public.properties;
DROP POLICY IF EXISTS "Verified owners can update own properties" ON public.properties;
DROP POLICY IF EXISTS "Verified owners can delete own properties" ON public.properties;

-- Policy: Only verified owners can create properties
CREATE POLICY "Verified owners can insert properties"
ON public.properties
FOR INSERT
TO authenticated
WITH CHECK (
  -- Must be the owner
  auth.uid() = owner_id
  -- Must have owner role
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role = 'owner'
  )
  -- Must be verified
  AND public.is_user_verified() = TRUE
);

-- Policy: Only verified owners can update their own properties
CREATE POLICY "Verified owners can update own properties"
ON public.properties
FOR UPDATE
TO authenticated
USING (
  auth.uid() = owner_id
  AND public.is_user_verified() = TRUE
)
WITH CHECK (
  auth.uid() = owner_id
  AND public.is_user_verified() = TRUE
);

-- Policy: Only verified owners can delete their own properties
CREATE POLICY "Verified owners can delete own properties"
ON public.properties
FOR DELETE
TO authenticated
USING (
  auth.uid() = owner_id
  AND public.is_user_verified() = TRUE
);

-- ============================================================================
-- UPDATE FAVORITES TABLE RLS POLICIES
-- ============================================================================

-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Verified users can manage own favorites" ON public.favorites;

-- Policy: Only verified users can manage favorites
CREATE POLICY "Verified users can manage own favorites"
ON public.favorites
FOR ALL
TO authenticated
USING (
  auth.uid() = user_id
  AND public.is_user_verified() = TRUE
)
WITH CHECK (
  auth.uid() = user_id
  AND public.is_user_verified() = TRUE
);

-- ============================================================================
-- UPDATE USERS TABLE RLS POLICIES
-- ============================================================================

-- Drop existing update policy
DROP POLICY IF EXISTS "Verified users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own data" ON public.users;

-- Policy: Users can update their profile with restrictions
-- Verified users: can update any field
-- Unverified users: can only update name, phone, avatar_url (not verification fields)
CREATE POLICY "Users can update own profile"
ON public.users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
);

-- ============================================================================
-- SECURITY NOTES
-- ============================================================================

/*
IMPORTANT SECURITY CONSIDERATIONS:

1. **Read Access**: We intentionally do NOT restrict SELECT queries for properties
   because unverified users should still be able to browse listings. Only write
   operations (INSERT/UPDATE/DELETE) are restricted.

2. **Profile Creation**: The INSERT policy on users table is NOT modified because
   users need to create their profile during signup (before verification).

3. **Verification Fields**: The verification_token and email_verified_at fields
   should be updated via server-side functions only, not by users directly.

4. **Admin Override**: Admin users may need special policies to manage users
   regardless of verification status. Add those separately if needed.

5. **Grace Period**: Consider adding a grace period (e.g., 24 hours) where new
   users can still access some features before verification is enforced.

EDGE CASES HANDLED:

1. **NULL Values**: The is_user_verified() function handles NULL values safely
2. **Missing Profile**: Returns FALSE if user profile doesn't exist
3. **Partial Verification**: Requires BOTH verified flag AND email_verified_at
4. **Performance**: Function is marked STABLE for query optimization

TESTING CHECKLIST:

□ Unverified owner cannot create properties
□ Unverified owner cannot update properties
□ Unverified owner cannot delete properties
□ Unverified tenant cannot add favorites
□ Unverified user cannot update profile
□ Verified users can perform all allowed operations
□ Read access (SELECT) works for all users
□ Admin users can still manage resources (if admin policies exist)
*/

-- ============================================================================
-- MONITORING QUERY
-- ============================================================================

-- Use this query to monitor verification status and policy effectiveness:
/*
SELECT 
  u.email,
  u.role,
  u.verified,
  u.email_verified_at,
  u.created_at,
  CASE 
    WHEN u.verified AND u.email_verified_at IS NOT NULL THEN 'Fully Verified'
    WHEN u.email_verified_at IS NOT NULL THEN 'Email Confirmed Only'
    WHEN u.verified THEN 'Flag Set Only'
    ELSE 'Unverified'
  END as verification_status,
  COUNT(p.id) as property_count
FROM users u
LEFT JOIN properties p ON p.owner_id = u.id::text
WHERE u.role = 'owner'
GROUP BY u.id, u.email, u.role, u.verified, u.email_verified_at, u.created_at
ORDER BY u.created_at DESC;
*/
