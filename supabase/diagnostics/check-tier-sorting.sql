-- ============================================================================
-- DIAGNOSTIC QUERIES: Plan Tier Sorting Issues
-- ============================================================================
-- Run these queries in Supabase SQL Editor to diagnose why paid properties
-- are not appearing on top of search results

-- 1. Check active subscriptions
-- ============================================================================
SELECT
    id,
    user_id,
    plan_name,
    status,
    end_date,
    created_at
FROM subscriptions
WHERE status = 'active'
  AND end_date > NOW()
ORDER BY created_at DESC
LIMIT 20;

-- Expected: Should show active paid subscriptions
-- If empty: No active subscriptions exist (this is the root cause)

-- ============================================================================
-- 2. Check plan_name format
-- ============================================================================
SELECT
    plan_name,
    COUNT(*) as count,
    status
FROM subscriptions
GROUP BY plan_name, status
ORDER BY count DESC;

-- Expected: plan_name should be 'Silver', 'Gold', 'Platinum', or 'Elite'
-- Issue: If plan_name is stored as '1 Month', '3 Months', etc., the tier lookup will fail

-- ============================================================================
-- 3. Check properties and their featured status
-- ============================================================================
SELECT
    p.id,
    p.owner_id,
    p.featured,
    p.status,
    p.created_at,
    s.plan_name,
    s.status as sub_status,
    s.end_date
FROM properties p
LEFT JOIN subscriptions s ON p.owner_id = s.user_id
    AND s.status = 'active'
    AND s.end_date > NOW()
WHERE p.status IN ('active', 'pending')
ORDER BY p.created_at DESC
LIMIT 50;

-- Expected: Properties with active subscriptions should have plan_name not null
-- Issue: If plan_name is NULL but subscription exists, check the subscription join

-- ============================================================================
-- 4. Check paid properties that are NOT featured (THIS IS THE BUG)
-- ============================================================================
SELECT
    p.id as property_id,
    p.owner_id,
    p.featured,
    s.plan_name,
    s.end_date as sub_end_date
FROM properties p
JOIN subscriptions s ON p.owner_id = s.user_id
WHERE s.status = 'active'
  AND s.end_date > NOW()
  AND s.plan_name ILIKE ANY ('%silver%', '%gold%', '%platinum%', '%elite%')
  AND p.status IN ('active', 'pending')
  AND p.featured = false;

-- Expected: Should return 0 rows
-- If returns rows: These properties should be featured but aren't

-- ============================================================================
-- 5. FIX: Auto-feature properties for paid plan owners
-- ============================================================================
UPDATE properties p
SET featured = true
FROM subscriptions s
WHERE p.owner_id = s.user_id
  AND s.status = 'active'
  AND s.end_date > NOW()
  AND s.plan_name ILIKE ANY (ARRAY['%silver%', '%gold%', '%platinum%', '%elite%'])
  AND p.status IN ('active', 'pending')
  AND p.featured = false;

-- Run this AFTER verifying the diagnostic queries above

-- ============================================================================
-- 6. Check if the issue is with plan_name case sensitivity
-- ============================================================================
SELECT
    s.plan_name,
    UPPER(s.plan_name) as upper_plan,
    CASE
        WHEN UPPER(s.plan_name) = 'ELITE' THEN 5
        WHEN UPPER(s.plan_name) = 'PLATINUM' THEN 4
        WHEN UPPER(s.plan_name) = 'GOLD' THEN 3
        WHEN UPPER(s.plan_name) = 'SILVER' THEN 2
        ELSE 1
    END as tier_rank
FROM subscriptions s
WHERE s.status = 'active'
  AND s.end_date > NOW()
LIMIT 10;

-- Expected: tier_rank should be 2-5 for paid plans
-- If tier_rank = 1: plan_name format doesn't match expected values
