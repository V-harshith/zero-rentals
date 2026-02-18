# Bulk Import Transaction System

## Overview

The bulk import transaction system ensures data consistency by wrapping owner creation, property creation, and subscription creation in a transaction context. If any step fails, all created data is rolled back to prevent orphaned records.

## Transaction Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     IMPORT TRANSACTION FLOW                      │
└─────────────────────────────────────────────────────────────────┘

1. INITIALIZE TRANSACTION
   ├── Create TransactionContext with jobId and adminUserId
   └── Set up tracking arrays for created records

2. CREATE OWNERS (Batched, 3 per batch)
   ├── For each owner in batch:
   │   ├── Create auth user
   │   ├── Create users table entry
   │   ├── Create subscription
   │   └── Track in TransactionContext
   ├── If batch fails:
   │   └── Rollback batch (delete created owners/subscriptions)
   └── Continue to next batch or abort on critical failure

3. CREATE PROPERTIES (Batched, 10 per batch)
   ├── For each property in batch:
   │   ├── Get owner ID from map
   │   ├── Create property
   │   ├── Assign images
   │   └── Track in TransactionContext
   ├── If batch fails:
   │   └── Rollback batch (delete created properties)
   └── Continue to next batch or abort on critical failure

4. FINALIZE OR ROLLBACK
   ├── On success:
   │   ├── Encrypt credentials
   │   ├── Update job status to 'completed'
   │   └── Log audit trail
   └── On failure:
       ├── Rollback all created data
       │   ├── Delete properties (via RPC or manual)
       │   ├── Delete subscriptions
       │   ├── Delete users table entries
       │   └── Delete auth users
       ├── Update job status to 'failed'
       └── Log rollback details
```

## Rollback Order

Data is rolled back in reverse order of creation to respect foreign key constraints:

1. **Properties First** - Properties reference owners (foreign key on `owner_id`)
2. **Subscriptions** - Subscriptions reference users (foreign key on `user_id`)
3. **Users Table Entries** - Users table references auth.users
4. **Auth Users Last** - Auth users are the root entity

## Transaction Context

The `TransactionContext` tracks all created records:

```typescript
interface TransactionContext {
  jobId: string                    // The bulk import job ID
  adminUserId: string              // Admin performing the import
  createdOwners: CreatedOwner[]    // Track created owners
  createdProperties: CreatedProperty[]  // Track created properties
  createdSubscriptions: CreatedSubscription[]  // Track subscriptions
  processedItems: Set<string>      // Idempotency tracking
  isRolledBack: boolean            // Prevent double rollback
  batchNumber: number              // Current batch for debugging
  failureSimulation?: FailureSimulationConfig  // Testing only
}
```

## API Usage

### Basic Transaction

```typescript
import {
  createTransactionContext,
  trackCreatedOwner,
  trackCreatedProperty,
  rollbackTransaction,
} from '@/lib/bulk-import-transaction'

// Initialize
const tx = createTransactionContext(jobId, adminId)

try {
  // Create owner
  const owner = await createAuthUser(data)
  trackCreatedOwner(tx, {
    email: owner.email,
    id: owner.id,
    password: tempPassword,
  })

  // Create property
  const property = await createProperty(data)
  trackCreatedProperty(tx, {
    id: property.id,
    psn: property.psn,
    ownerId: owner.id,
  })

} catch (error) {
  // Rollback on failure
  await rollbackTransaction(tx)
}
```

### Per-Batch Rollback

```typescript
import { rollbackBatch } from '@/lib/bulk-import-transaction'

// When a specific batch fails
const rollbackResult = await rollbackBatch(
  tx,
  batchPropertyIds,    // Properties created in this batch
  batchSubscriptionIds, // Subscriptions created in this batch
  batchOwnerIds        // Owners created in this batch
)

if (!rollbackResult.success) {
  console.error('Batch rollback failed:', rollbackResult.errors)
}
```

## Failure Simulation (Testing)

For testing rollback behavior, you can simulate failures:

```typescript
const tx = createTransactionContext(jobId, adminId, {
  enabled: true,
  failAtBatch: 2,        // Fail at batch 2
  failOperation: 'owner', // Fail during owner creation
  failAtItem: 1,         // Fail at item 1 in the batch
})
```

Or via HTTP header (non-production only):

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-failure-simulation: {\"enabled\":true,\"failAtBatch\":2,\"failOperation\":\"property\"}" \
  /api/admin/bulk-import/jobs/[id]/confirm
```

## Database RPC Functions

### rollback_bulk_import_properties

Deletes all properties associated with a bulk import job:

```sql
SELECT * FROM rollback_bulk_import_properties('job-uuid');
-- Returns: deleted_property_id, psn, success
```

### get_bulk_import_properties

Gets all properties created by a job:

```sql
SELECT * FROM get_bulk_import_properties('job-uuid');
-- Returns: property_id, psn, title, owner_id
```

## Error Handling

### Critical vs Non-Critical Failures

- **Critical Failures**: Trigger full rollback and abort import
  - Simulated failures (for testing)
  - Database connection errors
  - Authentication errors

- **Non-Critical Failures**: Logged but import continues
  - Individual owner creation failure
  - Individual property creation failure
  - Image assignment failure

### Rollback Result

```typescript
interface RollbackResult {
  success: boolean
  details: {
    propertiesAttempted: number
    propertiesSucceeded: number
    propertiesFailed: string[]
    subscriptionsAttempted: number
    subscriptionsSucceeded: number
    subscriptionsFailed: string[]
    ownersAttempted: number
    ownersSucceeded: number
    ownersFailed: string[]
  }
  errors: string[]
}
```

## Idempotency

The system uses idempotency keys to prevent duplicate operations:

- **Owner Creation**: `owner:{email}`
- **Property Creation**: `property:{psn}`

Idempotency is tracked in:
1. TransactionContext.processedItems (in-memory)
2. bulk_import_idempotency table (persistent)

## Audit Logging

All operations are logged to `bulk_import_audit_log`:

- `owner_created` - When an owner is created
- `property_created` - When a property is created
- `rollback_executed` - When rollback is performed
- `import_completed` - When import finishes successfully
- `import_failed` - When import fails

## Best Practices

1. **Always use transaction context** - Track every created record
2. **Check for rollback state** - Don't create new records after rollback
3. **Handle pre-existing owners** - Don't delete owners that already existed
4. **Use batch rollback** - For partial failures within a batch
5. **Log all operations** - For debugging and audit purposes
6. **Test failure scenarios** - Use failure simulation in development

## Security Considerations

1. **Failure simulation is disabled in production** - Requires `NODE_ENV !== 'production'`
2. **Pre-existing owners are never deleted** - Only owners created in this transaction
3. **Audit logs include transaction details** - For traceability
4. **Rollback requires admin privileges** - Via supabaseAdmin client

## Performance Considerations

1. **Batch processing** - Owners in batches of 3, properties in batches of 10
2. **Rate limiting delays** - Between batches to avoid API limits
3. **RPC for bulk operations** - `rollback_bulk_import_properties` for efficiency
4. **Idempotency caching** - In-memory Set for fast lookups

## Troubleshooting

### Rollback Partially Failed

If rollback partially fails:
1. Check `bulk_import_audit_log` for details
2. Manually clean up remaining data using job ID
3. Use `get_bulk_import_properties` to find orphaned records

### Orphaned Records

To find orphaned records after a failed import:

```sql
-- Find properties without valid owners
SELECT p.*
FROM properties p
LEFT JOIN users u ON p.owner_id = u.id
WHERE p.bulk_import_job_id = 'job-uuid'
  AND u.id IS NULL;

-- Find subscriptions without valid users
SELECT s.*
FROM subscriptions s
LEFT JOIN users u ON s.user_id = u.id
WHERE s.created_at > '2024-01-01'
  AND u.id IS NULL;
```

### Retry After Failure

The idempotency system allows safe retries:

1. Fix the underlying issue
2. Retry the import with the same job ID
3. Already-completed operations will be skipped
4. Failed operations will be retried
