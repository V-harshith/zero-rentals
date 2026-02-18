# Property Concurrent Edit Protection

This document describes the database-level concurrent edit protection system for property operations in ZeroRentals.

## Overview

The system uses PostgreSQL/Supabase for distributed locking to prevent race conditions when multiple admins attempt to modify the same property simultaneously. This replaces the previous in-memory `approvalLocks` Map that didn't work across Vercel serverless instances.

## Architecture

### Database Schema

The `property_locks` table stores active locks:

```sql
CREATE TABLE property_locks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lock_type TEXT NOT NULL DEFAULT 'edit',
    acquired_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    session_id TEXT,
    UNIQUE(property_id, lock_type)
);
```

### Lock Types

Different operations use different lock types to allow concurrent non-conflicting operations:

| Lock Type | Operations | Description |
|-----------|------------|-------------|
| `approve` | Approve property | Prevents concurrent approval/rejection |
| `reject` | Reject property | Prevents concurrent approval/rejection |
| `verify` | Verify/unverify property | Prevents concurrent verification changes |
| `type_change` | Change property type | Prevents concurrent type modifications |
| `delete` | Delete property | Prevents concurrent deletion/modification |
| `edit` | General edits | Default for property updates |

## API Reference

### Client Library (`lib/property-locks.ts`)

#### `acquirePropertyLock`

Attempts to acquire a distributed lock on a property.

```typescript
const result = await acquirePropertyLock(
  propertyId: string,
  adminId: string,
  timeoutSeconds: number = 30,
  lockType: LockType = 'edit'
): Promise<LockResult>
```

**Returns:**
- `success: boolean` - Whether lock was acquired
- `error?: string` - Error message if failed
- `expiresAt?: string` - ISO timestamp when lock expires
- `secondsRemaining?: number` - Seconds until expiration
- `extended?: boolean` - True if existing lock was extended

**Example:**
```typescript
const lockResult = await acquirePropertyLock(propId, adminId, 30, 'approve')
if (!lockResult.success) {
  return NextResponse.json(
    { error: lockResult.error },
    { status: 423 }
  )
}
```

#### `releasePropertyLock`

Releases a lock held by an admin.

```typescript
const result = await releasePropertyLock(
  propertyId: string,
  adminId: string,
  lockType: LockType = 'edit'
): Promise<LockResult>
```

**Example:**
```typescript
try {
  // ... do work ...
} finally {
  await releasePropertyLock(propId, adminId, 'approve')
}
```

#### `extendPropertyLock`

Extends the expiration time of an existing lock.

```typescript
const result = await extendPropertyLock(
  propertyId: string,
  adminId: string,
  additionalSeconds: number = 30,
  lockType: LockType = 'edit'
): Promise<LockResult>
```

#### `getPropertyLockStatus`

Checks the current lock status for a property.

```typescript
const status = await getPropertyLockStatus(
  propertyId: string,
  lockType: LockType = 'edit'
): Promise<LockStatus>
```

#### `withPropertyLock`

Higher-order function that manages lock acquisition/release automatically.

```typescript
const result = await withPropertyLock(
  propertyId,
  adminId,
  async () => {
    // This code runs while holding the lock
    return await updateProperty(propertyId, data)
  },
  60,
  'edit'
)
```

## Database Functions

### `acquire_property_lock`

```sql
SELECT acquire_property_lock(
  p_property_id UUID,
  p_admin_id UUID,
  p_lock_type TEXT DEFAULT 'edit',
  p_timeout_seconds INTEGER DEFAULT 30
): JSONB
```

**Features:**
- Automatically cleans up expired locks before acquisition
- Extends existing lock if same admin re-acquires
- Returns detailed error if lock held by different admin
- Uses unique constraint to prevent race conditions

### `release_property_lock`

```sql
SELECT release_property_lock(
  p_property_id UUID,
  p_admin_id UUID,
  p_lock_type TEXT DEFAULT 'edit'
): JSONB
```

### `extend_property_lock`

```sql
SELECT extend_property_lock(
  p_property_id UUID,
  p_admin_id UUID,
  p_lock_type TEXT DEFAULT 'edit',
  p_additional_seconds INTEGER DEFAULT 30
): JSONB
```

### `cleanup_expired_locks`

```sql
SELECT cleanup_expired_locks(): INTEGER
-- Returns: number of expired locks removed
```

### `get_property_lock_status`

```sql
SELECT get_property_lock_status(
  p_property_id UUID,
  p_lock_type TEXT DEFAULT 'edit'
): JSONB
```

## Timeout Behavior

### Default Timeouts

- **Default lock duration:** 30 seconds
- **Maximum lock duration:** 300 seconds (5 minutes)
- **Minimum lock duration:** 1 second

### Timeout Scenarios

1. **Normal expiration:** Lock is automatically released when `expires_at` is reached
2. **Cleanup:** Expired locks are removed on next acquisition attempt or via `cleanup_expired_locks()`
3. **Extension:** Same admin can extend their lock before expiration
4. **Force release:** Locks are released when property is deleted (CASCADE)

## Protected Routes

The following API routes use database-level locking:

| Route | Lock Type | HTTP Status on Lock Failure |
|-------|-----------|----------------------------|
| `/api/admin/properties/[id]/approve` | `approve` | 423 Locked |
| `/api/admin/properties/[id]/reject` | `reject` | 423 Locked |
| `/api/admin/properties/[id]/verify` | `verify` | 423 Locked |
| `/api/admin/properties/[id]/type` | `type_change` | 423 Locked |
| `/api/admin/properties/[id]/delete` | `delete` | 423 Locked |

## Error Handling

### HTTP 423 Locked Response

When a lock cannot be acquired, the API returns:

```json
{
  "error": "Property is being processed by another admin. Please try again later.",
  "locked_by": "admin-uuid",
  "expires_at": "2026-02-18T10:30:00Z",
  "seconds_remaining": 15
}
```

### Client-Side Handling

```typescript
const response = await fetch(`/api/admin/properties/${id}/approve`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' }
})

if (response.status === 423) {
  const data = await response.json()
  showNotification(`Property locked by another admin. Retry in ${data.seconds_remaining}s`)
}
```

## Best Practices

### 1. Always Use Try-Finally

```typescript
const lock = await acquirePropertyLock(id, adminId, 30, 'edit')
if (!lock.success) return errorResponse

try {
  // Perform operation
} finally {
  await releasePropertyLock(id, adminId, 'edit')
}
```

### 2. Choose Appropriate Timeouts

- Quick operations (toggle verify): 30 seconds
- Medium operations (approve/reject): 30 seconds
- Long operations (bulk updates): 60-120 seconds
- Never exceed 300 seconds

### 3. Handle Lock Failures Gracefully

- Show user-friendly messages
- Suggest retry time based on `seconds_remaining`
- Consider auto-retry with exponential backoff

### 4. Use Specific Lock Types

Use specific lock types instead of generic `edit` when possible to allow concurrent non-conflicting operations.

## Migration

To apply the property locks system:

```bash
# Run the migration in Supabase SQL Editor
supabase/migrations/20260218_property_concurrent_edit_locks.sql
```

The migration is idempotent and can be safely re-run.

## Monitoring

### Check Active Locks

```sql
-- View all active locks
SELECT
  pl.property_id,
  p.title as property_title,
  pl.admin_id,
  u.name as admin_name,
  pl.lock_type,
  pl.acquired_at,
  pl.expires_at,
  EXTRACT(EPOCH FROM (pl.expires_at - NOW()))::INTEGER as seconds_remaining
FROM property_locks pl
JOIN properties p ON pl.property_id = p.id
JOIN users u ON pl.admin_id = u.id
WHERE pl.expires_at > NOW()
ORDER BY pl.acquired_at DESC;
```

### Cleanup Stale Locks

```sql
-- Manual cleanup of expired locks
SELECT cleanup_expired_locks();
```

## Comparison with In-Memory Locks

| Aspect | In-Memory (Old) | Database Locks (New) |
|--------|-----------------|---------------------|
| Cross-instance | No | Yes |
| Persistence | Lost on deploy | Persistent |
| Timeout | Yes (30s) | Yes (configurable) |
| Scalability | Single instance | Multi-instance |
| Failover | None | Automatic expiration |
| Performance | Fast | Network round-trip |

## Security Considerations

1. **Lock Ownership:** Only the admin who acquired a lock can release it
2. **Automatic Expiration:** Locks expire even if the client crashes
3. **CASCADE Delete:** Locks are cleaned up when properties are deleted
4. **RLS:** Row-level security prevents unauthorized lock viewing
5. **Rate Limiting:** Separate from locks, prevents lock abuse

## Future Enhancements

Potential improvements to consider:

1. **WebSocket Notifications:** Notify admins when a property becomes available
2. **Lock Queue:** Allow admins to queue for access instead of failing immediately
3. **Lock Statistics:** Track lock contention for optimization
4. **Batch Locking:** Lock multiple properties atomically for bulk operations
