-- Check if any payments were actually made
SELECT
    id,
    user_id,
    amount,
    plan_name,
    status,
    created_at
FROM payment_logs
WHERE status = 'captured'
ORDER BY created_at DESC
LIMIT 20;

-- Check for successful payments
SELECT
    id,
    user_id,
    amount,
    plan_name,
    status,
    created_at
FROM payment_logs
WHERE status != 'failed'
ORDER BY created_at DESC
LIMIT 20;
