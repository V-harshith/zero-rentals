-- ============================================================================
-- SECURITY LINT FIX: Resolve 3 Critical Issues
-- ============================================================================
-- Issue 1: bulk_import_idempotency - RLS disabled (unused table, drop it)
-- Issue 2: property_image_uploads - RLS disabled (unused table, drop it)
-- Issue 3: property_views_summary - Security Definer view (recreate with security_invoker)
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop unused tables (Issues 1 & 2)
-- These tables were created for a bulk import feature that is commented out
-- and not in use. Dropping them resolves the RLS disabled lint issues.
-- ============================================================================

DROP TABLE IF EXISTS bulk_import_idempotency CASCADE;
DROP TABLE IF EXISTS property_image_uploads CASCADE;

-- ============================================================================
-- STEP 2: Recreate property_views_summary with security_invoker (Issue 3)
-- The original view was created without security_invoker, causing it to run
-- with the view owner's privileges instead of the querying user's privileges.
-- This bypassed RLS on the underlying properties and property_views tables.
--
-- With security_invoker = true, the view respects the caller's RLS policies,
-- so owners only see their own properties' analytics, and admins see all.
-- ============================================================================

DROP VIEW IF EXISTS property_views_summary;

CREATE VIEW property_views_summary WITH (security_invoker = true) AS
SELECT
    p.id AS property_id,
    p.title AS property_title,
    p.views AS cached_views,
    COUNT(pv.id) FILTER (WHERE pv.is_unique_view = TRUE AND pv.is_bot = FALSE) AS actual_unique_views,
    COUNT(pv.id) AS total_view_records,
    COUNT(pv.id) FILTER (WHERE pv.is_bot = TRUE) AS bot_views,
    COUNT(pv.id) FILTER (WHERE pv.is_suspicious = TRUE) AS suspicious_views,
    MAX(pv.view_timestamp) AS last_viewed_at
FROM properties p
LEFT JOIN property_views pv ON pv.property_id = p.id
GROUP BY p.id, p.title, p.views;

-- Grant access to authenticated users
GRANT SELECT ON property_views_summary TO authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After running this migration, verify the fixes:
--
-- 1. Check tables no longer exist:
--    SELECT table_name FROM information_schema.tables
--    WHERE table_name IN ('bulk_import_idempotency', 'property_image_uploads');
--    -- Should return 0 rows
--
-- 2. Check view has security_invoker:
--    SELECT relname, reloptions FROM pg_class
--    WHERE relname = 'property_views_summary';
--    -- Should show: {security_invoker=true}
--
-- 3. Run Supabase lint again - all 3 issues should be resolved.
-- ============================================================================
