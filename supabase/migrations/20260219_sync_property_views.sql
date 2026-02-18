-- ============================================================================
-- SYNC PROPERTY VIEWS MIGRATION
-- Fixes view count inconsistencies and ensures properties.views stays in sync
-- with the property_views tracking table
-- ============================================================================

-- ============================================================================
-- STEP 1: Sync existing view counts from property_views to properties table
-- ============================================================================

-- Update properties.views to reflect actual unique, non-bot view counts
UPDATE properties p
SET views = COALESCE((
    SELECT COUNT(*)
    FROM property_views pv
    WHERE pv.property_id = p.id
      AND pv.is_unique_view = TRUE
      AND pv.is_bot = FALSE
), 0)
WHERE EXISTS (
    SELECT 1 FROM property_views pv2 WHERE pv2.property_id = p.id
);

-- ============================================================================
-- STEP 2: Create trigger function to keep views synchronized
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_property_views_counter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only increment for unique, non-bot views
    IF NEW.is_unique_view = TRUE AND NEW.is_bot = FALSE THEN
        UPDATE properties
        SET views = COALESCE(views, 0) + 1,
            updated_at = NOW()
        WHERE id = NEW.property_id;
    END IF;

    RETURN NEW;
END;
$$;

-- ============================================================================
-- STEP 3: Create trigger on property_views
-- ============================================================================

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS sync_property_views_trigger ON property_views;

-- Create trigger to sync views counter
CREATE TRIGGER sync_property_views_trigger
    AFTER INSERT ON property_views
    FOR EACH ROW
    EXECUTE FUNCTION sync_property_views_counter();

-- ============================================================================
-- STEP 4: Create function to manually recalculate views (for maintenance)
-- ============================================================================

CREATE OR REPLACE FUNCTION recalculate_property_views(p_property_id UUID DEFAULT NULL)
RETURNS TABLE(property_id UUID, old_views INTEGER, new_views INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH view_counts AS (
        SELECT
            p.id AS pid,
            COALESCE(p.views, 0) AS old_count,
            COALESCE((
                SELECT COUNT(*)
                FROM property_views pv
                WHERE pv.property_id = p.id
                  AND pv.is_unique_view = TRUE
                  AND pv.is_bot = FALSE
            ), 0) AS new_count
        FROM properties p
        WHERE p_property_id IS NULL OR p.id = p_property_id
    ),
    updated AS (
        UPDATE properties p
        SET views = vc.new_count,
            updated_at = NOW()
        FROM view_counts vc
        WHERE p.id = vc.pid
          AND vc.old_count != vc.new_count
        RETURNING p.id, vc.old_count, vc.new_count
    )
    SELECT * FROM updated;
END;
$$;

GRANT EXECUTE ON FUNCTION recalculate_property_views(UUID) TO authenticated;

-- ============================================================================
-- STEP 5: Create view for admin analytics verification
-- ============================================================================

CREATE OR REPLACE VIEW property_views_summary AS
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

-- Grant access to authenticated users (admin check done at application level)
GRANT SELECT ON property_views_summary TO authenticated;

-- ============================================================================
-- VERIFICATION QUERY (run manually to check sync status):
--
-- SELECT * FROM property_views_summary WHERE cached_views != actual_unique_views;
--
-- MANUAL RECALCULATION (if needed):
--
-- SELECT * FROM recalculate_property_views();
--
-- ============================================================================
