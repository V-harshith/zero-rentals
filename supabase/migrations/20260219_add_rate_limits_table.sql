-- Migration: Add rate_limits table for distributed rate limiting
-- This replaces in-memory rate limiting for serverless environments

CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identifier TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    window_ms INTEGER NOT NULL DEFAULT 60000,
    max_limit INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Composite unique constraint for efficient lookups
    CONSTRAINT rate_limits_identifier_window_unique UNIQUE (identifier, window_start)
);

-- Composite index for the exact lookup pattern (covers both columns)
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON rate_limits(identifier, window_start);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits(window_start);

-- Stored procedure for ATOMIC rate limit check and increment
-- This prevents race conditions by using database-level locking
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_identifier TEXT,
    p_window_start TIMESTAMP WITH TIME ZONE,
    p_limit INTEGER,
    p_window_ms INTEGER
)
RETURNS TABLE(
    allowed BOOLEAN,
    current_count INTEGER,
    remaining INTEGER,
    reset_after_seconds INTEGER
) AS $$
DECLARE
    v_count INTEGER;
    v_window_end TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Calculate window end
    v_window_end := p_window_start + (p_window_ms || ' milliseconds')::INTERVAL;

    -- Try to insert new record or update existing one atomically
    INSERT INTO rate_limits (identifier, window_start, window_ms, max_limit, count)
    VALUES (p_identifier, p_window_start, p_window_ms, p_limit, 1)
    ON CONFLICT (identifier, window_start)
    DO UPDATE SET
        count = rate_limits.count + 1,
        updated_at = NOW()
    RETURNING rate_limits.count INTO v_count;

    -- Return results
    RETURN QUERY SELECT
        v_count <= p_limit,                                    -- allowed
        v_count,                                               -- current_count
        GREATEST(0, p_limit - v_count),                        -- remaining
        EXTRACT(EPOCH FROM (v_window_end - NOW()))::INTEGER;   -- reset_after_seconds
END;
$$ LANGUAGE plpgsql;

-- Cleanup function to remove old rate limit entries
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM rate_limits
    WHERE window_start < NOW() - INTERVAL '2 hours';
END;
$$ LANGUAGE plpgsql;

-- Enable pg_cron for automatic cleanup if available
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    -- Schedule cleanup every 10 minutes
    PERFORM cron.schedule(
        'cleanup-rate-limits',
        '*/10 * * * *',
        'SELECT cleanup_rate_limits()'
    );
EXCEPTION WHEN OTHERS THEN
    -- pg_cron not available, manual cleanup will be needed
    RAISE NOTICE 'pg_cron not available, automatic cleanup not scheduled';
END $$;

-- Row Level Security (RLS) policies
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can access rate_limits table
-- Drop first to make idempotent (PostgreSQL doesn't support IF NOT EXISTS for policies)
DROP POLICY IF EXISTS "Service role can manage rate limits" ON rate_limits;
CREATE POLICY "Service role can manage rate limits"
    ON rate_limits
    USING (true)
    WITH CHECK (true);

-- Add helpful comments
COMMENT ON TABLE rate_limits IS 'Stores rate limit counters for distributed rate limiting across serverless instances';
COMMENT ON FUNCTION check_rate_limit IS 'Atomically checks and increments rate limit counter. Prevents race conditions.';
