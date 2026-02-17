-- ============================================================================
-- SECURE VIEW TRACKING SYSTEM
-- Production-grade view tracking with abuse prevention and race condition handling
-- ============================================================================

-- Table to track individual property views with session info
CREATE TABLE IF NOT EXISTS property_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    viewer_session_id TEXT, -- Anonymous session tracking
    viewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    viewer_ip TEXT, -- Hashed IP for privacy
    user_agent TEXT,
    referrer TEXT,
    view_timestamp TIMESTAMPTZ DEFAULT NOW(),
    is_unique_view BOOLEAN DEFAULT TRUE,
    is_bot BOOLEAN DEFAULT FALSE,
    is_suspicious BOOLEAN DEFAULT FALSE,
    view_source TEXT DEFAULT 'direct', -- 'search', 'direct', 'featured', etc.
    session_duration_seconds INTEGER,
    device_type TEXT, -- 'mobile', 'desktop', 'tablet'
    city TEXT,
    country TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_property_views_property_id ON property_views(property_id);
CREATE INDEX IF NOT EXISTS idx_property_views_timestamp ON property_views(view_timestamp);
CREATE INDEX IF NOT EXISTS idx_property_views_session ON property_views(viewer_session_id, property_id);
CREATE INDEX IF NOT EXISTS idx_property_views_user ON property_views(viewer_user_id, property_id);
CREATE INDEX IF NOT EXISTS idx_property_views_unique ON property_views(property_id, viewer_session_id, view_timestamp);

-- Composite index for analytics queries
CREATE INDEX IF NOT EXISTS idx_property_views_analytics
ON property_views(property_id, view_timestamp, is_unique_view, is_bot);

-- ============================================================================
-- SECURE VIEW TRACKING FUNCTION
-- Handles race conditions, abuse prevention, and duplicate view detection
-- ============================================================================

CREATE OR REPLACE FUNCTION track_property_view(
    p_property_id UUID,
    p_session_id TEXT,
    p_user_id UUID DEFAULT NULL,
    p_ip_hash TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_referrer TEXT DEFAULT NULL,
    p_view_source TEXT DEFAULT 'direct'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_last_view TIMESTAMPTZ;
    v_is_unique BOOLEAN := TRUE;
    v_is_bot BOOLEAN := FALSE;
    v_view_count INTEGER;
    v_minutes_since_last_view INTEGER;
    v_result JSONB;
    v_device_type TEXT;
BEGIN
    -- Bot detection: Check user agent for common bot patterns
    IF p_user_agent IS NOT NULL THEN
        IF p_user_agent ~* '(bot|crawler|spider|scrape|curl|wget|python|java|scrapy)'
           AND p_user_agent !~* '(chrome|firefox|safari|edge|opera|brave)' THEN
            v_is_bot := TRUE;
        END IF;
    END IF;

    -- Determine device type from user agent
    IF p_user_agent IS NOT NULL THEN
        IF p_user_agent ~* 'mobile|android|iphone|ipad|ipod' THEN
            v_device_type := 'mobile';
        ELSIF p_user_agent ~* 'tablet|ipad' THEN
            v_device_type := 'tablet';
        ELSE
            v_device_type := 'desktop';
        END IF;
    END IF;

    -- Rate limiting: Check if same session viewed this property recently (5 minute cooldown)
    SELECT MAX(view_timestamp) INTO v_last_view
    FROM property_views
    WHERE property_id = p_property_id
      AND (
          (p_session_id IS NOT NULL AND viewer_session_id = p_session_id)
          OR (p_user_id IS NOT NULL AND viewer_user_id = p_user_id)
          OR (p_ip_hash IS NOT NULL AND viewer_ip = p_ip_hash)
      );

    IF v_last_view IS NOT NULL THEN
        v_minutes_since_last_view := EXTRACT(EPOCH FROM (NOW() - v_last_view)) / 60;

        -- If viewed within 5 minutes, don't count as unique view
        IF v_minutes_since_last_view < 5 THEN
            v_is_unique := FALSE;
        END IF;
    END IF;

    -- Also check for suspicious rapid viewing (more than 10 views in 1 minute from same session)
    SELECT COUNT(*) INTO v_view_count
    FROM property_views
    WHERE viewer_session_id = p_session_id
      AND view_timestamp > NOW() - INTERVAL '1 minute';

    -- Insert the view record
    INSERT INTO property_views (
        property_id,
        viewer_session_id,
        viewer_user_id,
        viewer_ip,
        user_agent,
        referrer,
        is_unique_view,
        is_bot,
        is_suspicious,
        view_source,
        device_type
    ) VALUES (
        p_property_id,
        p_session_id,
        p_user_id,
        p_ip_hash,
        p_user_agent,
        p_referrer,
        v_is_unique AND NOT v_is_bot, -- Bots don't count as unique
        v_is_bot,
        v_view_count > 10, -- Mark as suspicious if >10 views in 1 minute
        p_view_source,
        v_device_type
    );

    -- Atomic increment of views counter (only for unique, non-bot views)
    IF v_is_unique AND NOT v_is_bot THEN
        UPDATE properties
        SET views = COALESCE(views, 0) + 1,
            updated_at = NOW()
        WHERE id = p_property_id;
    END IF;

    -- Return result
    v_result := jsonb_build_object(
        'success', TRUE,
        'is_unique', v_is_unique AND NOT v_is_bot,
        'is_bot', v_is_bot,
        'is_suspicious', v_view_count > 10,
        'total_views', (SELECT views FROM properties WHERE id = p_property_id),
        'minutes_since_last', v_minutes_since_last_view
    );

    RETURN v_result;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION track_property_view(UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION track_property_view(UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO anon;

-- ============================================================================
-- ANALYTICS FUNCTIONS
-- ============================================================================

-- Get property analytics for owner dashboard
CREATE OR REPLACE FUNCTION get_property_analytics(
    p_property_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'property_id', p_property_id,
        'total_views', COUNT(*),
        'unique_views', COUNT(*) FILTER (WHERE is_unique_view = TRUE),
        'bot_views', COUNT(*) FILTER (WHERE is_bot = TRUE),
        'suspicious_views', COUNT(*) FILTER (WHERE is_suspicious = TRUE),
        'views_today', COUNT(*) FILTER (WHERE view_timestamp::DATE = CURRENT_DATE),
        'views_this_week', COUNT(*) FILTER (WHERE view_timestamp >= NOW() - INTERVAL '7 days'),
        'views_this_month', COUNT(*) FILTER (WHERE view_timestamp >= NOW() - INTERVAL '30 days'),
        'mobile_views', COUNT(*) FILTER (WHERE device_type = 'mobile'),
        'desktop_views', COUNT(*) FILTER (WHERE device_type = 'desktop'),
        'top_referrers', (
            SELECT jsonb_agg(jsonb_build_object('source', referrer, 'count', cnt))
            FROM (
                SELECT referrer, COUNT(*) as cnt
                FROM property_views
                WHERE property_id = p_property_id
                  AND view_timestamp >= NOW() - (p_days || ' days')::INTERVAL
                  AND referrer IS NOT NULL
                GROUP BY referrer
                ORDER BY cnt DESC
                LIMIT 5
            ) sub
        ),
        'daily_views', (
            SELECT jsonb_agg(jsonb_build_object('date', view_date, 'views', view_count))
            FROM (
                SELECT view_timestamp::DATE as view_date, COUNT(*) as view_count
                FROM property_views
                WHERE property_id = p_property_id
                  AND view_timestamp >= NOW() - (p_days || ' days')::INTERVAL
                  AND is_bot = FALSE
                GROUP BY view_timestamp::DATE
                ORDER BY view_date DESC
                LIMIT p_days
            ) sub
        )
    ) INTO v_result
    FROM property_views
    WHERE property_id = p_property_id
      AND view_timestamp >= NOW() - (p_days || ' days')::INTERVAL;

    RETURN COALESCE(v_result, jsonb_build_object(
        'property_id', p_property_id,
        'total_views', 0,
        'unique_views', 0,
        'views_today', 0
    ));
END;
$$;

GRANT EXECUTE ON FUNCTION get_property_analytics(UUID, INTEGER) TO authenticated;

-- Get admin platform-wide analytics
CREATE OR REPLACE FUNCTION get_platform_analytics(
    p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_views', COUNT(*),
        'unique_views', COUNT(*) FILTER (WHERE is_unique_view = TRUE),
        'bot_views_filtered', COUNT(*) FILTER (WHERE is_bot = TRUE),
        'suspicious_activity', COUNT(*) FILTER (WHERE is_suspicious = TRUE),
        'views_today', COUNT(*) FILTER (WHERE view_timestamp::DATE = CURRENT_DATE),
        'views_this_week', COUNT(*) FILTER (WHERE view_timestamp >= NOW() - INTERVAL '7 days'),
        'views_this_month', COUNT(*) FILTER (WHERE view_timestamp >= NOW() - INTERVAL '30 days'),
        'top_properties', (
            SELECT jsonb_agg(jsonb_build_object(
                'property_id', property_id,
                'property_title', p.title,
                'view_count', cnt
            ))
            FROM (
                SELECT property_id, COUNT(*) as cnt
                FROM property_views
                WHERE view_timestamp >= NOW() - (p_days || ' days')::INTERVAL
                  AND is_bot = FALSE
                GROUP BY property_id
                ORDER BY cnt DESC
                LIMIT 10
            ) sub
            JOIN properties p ON p.id = sub.property_id
        ),
        'views_by_city', (
            SELECT jsonb_agg(jsonb_build_object('city', city, 'views', cnt))
            FROM (
                SELECT COALESCE(pv.city, 'Unknown') as city, COUNT(*) as cnt
                FROM property_views pv
                WHERE pv.view_timestamp >= NOW() - (p_days || ' days')::INTERVAL
                  AND pv.is_bot = FALSE
                GROUP BY pv.city
                ORDER BY cnt DESC
                LIMIT 10
            ) sub
        ),
        'views_by_type', (
            SELECT jsonb_agg(jsonb_build_object('type', property_type, 'views', cnt))
            FROM (
                SELECT p.property_type, COUNT(*) as cnt
                FROM property_views pv
                JOIN properties p ON p.id = pv.property_id
                WHERE pv.view_timestamp >= NOW() - (p_days || ' days')::INTERVAL
                  AND pv.is_bot = FALSE
                GROUP BY p.property_type
                ORDER BY cnt DESC
            ) sub
        )
    ) INTO v_result
    FROM property_views
    WHERE view_timestamp >= NOW() - (p_days || ' days')::INTERVAL;

    RETURN COALESCE(v_result, jsonb_build_object('total_views', 0));
END;
$$;

GRANT EXECUTE ON FUNCTION get_platform_analytics(INTEGER) TO authenticated;

-- ============================================================================
-- CLEANUP FUNCTION - Run periodically to remove old bot/suspicious views
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_suspicious_views()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM property_views
    WHERE is_bot = TRUE
       OR is_suspicious = TRUE
       OR view_timestamp < NOW() - INTERVAL '90 days';

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_suspicious_views() TO authenticated;

-- ============================================================================
-- RLS POLICIES FOR PROPERTY_VIEWS
-- ============================================================================

ALTER TABLE property_views ENABLE ROW LEVEL SECURITY;

-- Owners can only see views for their own properties
CREATE POLICY "Owners can view analytics for their properties"
ON property_views
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM properties p
        WHERE p.id = property_views.property_id
          AND p.owner_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- Allow inserts from API (tracked via function)
CREATE POLICY "Allow view tracking inserts"
ON property_views
FOR INSERT
TO authenticated, anon
WITH CHECK (TRUE);

-- ============================================================================
-- TRIGGER TO UPDATE PROPERTY VIEWS COUNTER (Fallback)
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_property_views(property_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- This is a legacy function for backwards compatibility
    -- New code should use track_property_view()
    UPDATE properties
    SET views = COALESCE(views, 0) + 1
    WHERE id = property_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_property_views(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_property_views(UUID) TO anon;
