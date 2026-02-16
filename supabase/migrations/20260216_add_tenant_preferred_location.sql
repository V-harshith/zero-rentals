-- Migration: Add preferred city and area columns for tenant preferences
-- Date: 2026-02-16

-- Add preferred_city column to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS preferred_city TEXT,
ADD COLUMN IF NOT EXISTS preferred_area TEXT;

-- Create index for filtering/searching by preferred location
CREATE INDEX IF NOT EXISTS idx_users_preferred_city ON public.users(preferred_city);
CREATE INDEX IF NOT EXISTS idx_users_preferred_area ON public.users(preferred_area);

-- Add comments for documentation
COMMENT ON COLUMN public.users.preferred_city IS 'Tenant preferred city for property search';
COMMENT ON COLUMN public.users.preferred_area IS 'Tenant preferred area/locality within the preferred city';

-- Update RLS policies if needed (users can update their own preferences)
-- No new policies needed as existing update policies should cover these columns
