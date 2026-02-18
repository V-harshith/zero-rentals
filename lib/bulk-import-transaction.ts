// ============================================================================
// Bulk Import Transaction Management
// ============================================================================
//
// This module provides comprehensive transaction support for bulk import
// operations, ensuring data consistency through rollback capabilities.
//
// Transaction Flow:
// 1. Create transaction context at start of import
// 2. Track all created records (owners, properties, subscriptions)
// 3. If ANY step fails, rollback all created data
// 4. Rollback order: Properties -> Subscriptions -> Users -> Auth Users
//
// ============================================================================

import { supabaseAdmin } from "@/lib/supabase-admin"

// ============================================================================
// Types
// ============================================================================

export interface CreatedOwner {
    email: string
    id: string
    password: string
    createdAt: string
}

export interface CreatedProperty {
    id: string
    psn: string
    ownerId: string
    createdAt: string
}

export interface CreatedSubscription {
    id: string
    userId: string
    createdAt: string
}

export interface TransactionContext {
    jobId: string
    adminUserId: string
    createdOwners: CreatedOwner[]
    createdProperties: CreatedProperty[]
    createdSubscriptions: CreatedSubscription[]
    processedItems: Set<string>
    isRolledBack: boolean
    batchNumber: number
    failureSimulation?: FailureSimulationConfig
}

export interface FailureSimulationConfig {
    enabled: boolean
    failAtBatch?: number
    failAtItem?: number
    failOperation?: 'owner' | 'property' | 'subscription'
    failAfterCount?: number
}

export interface RollbackResult {
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

export interface BatchResult<T> {
    success: boolean
    data?: T
    error?: string
    rolledBack?: boolean
}

// ============================================================================
// Transaction Context Management
// ============================================================================

/**
 * Creates a new transaction context for tracking bulk import operations
 */
export function createTransactionContext(
    jobId: string,
    adminUserId: string,
    failureSimulation?: FailureSimulationConfig
): TransactionContext {
    return {
        jobId,
        adminUserId,
        createdOwners: [],
        createdProperties: [],
        createdSubscriptions: [],
        processedItems: new Set(),
        isRolledBack: false,
        batchNumber: 0,
        failureSimulation: failureSimulation?.enabled ? failureSimulation : undefined,
    }
}

/**
 * Checks if failure should be simulated for the current operation
 */
export function shouldSimulateFailure(
    tx: TransactionContext,
    operation: 'owner' | 'property' | 'subscription',
    batchNumber?: number,
    itemNumber?: number
): boolean {
    if (!tx.failureSimulation?.enabled) return false

    const sim = tx.failureSimulation

    // Check operation type match
    if (sim.failOperation && sim.failOperation !== operation) return false

    // Check batch number match
    if (sim.failAtBatch !== undefined && batchNumber !== undefined) {
        if (sim.failAtBatch !== batchNumber) return false
    }

    // Check item number match
    if (sim.failAtItem !== undefined && itemNumber !== undefined) {
        if (sim.failAtItem !== itemNumber) return false
    }

    // Check count-based failure
    if (sim.failAfterCount !== undefined) {
        const currentCount = tx.createdOwners.length + tx.createdProperties.length + tx.createdSubscriptions.length
        if (currentCount < sim.failAfterCount) return false
    }

    return true
}

// ============================================================================
// Record Tracking
// ============================================================================

/**
 * Tracks a newly created owner in the transaction context
 */
export function trackCreatedOwner(
    tx: TransactionContext,
    owner: Omit<CreatedOwner, 'createdAt'>
): void {
    if (tx.isRolledBack) {
        throw new Error('Cannot track new owner: transaction has been rolled back')
    }

    tx.createdOwners.push({
        ...owner,
        createdAt: new Date().toISOString(),
    })
}

/**
 * Tracks a newly created property in the transaction context
 */
export function trackCreatedProperty(
    tx: TransactionContext,
    property: Omit<CreatedProperty, 'createdAt'>
): void {
    if (tx.isRolledBack) {
        throw new Error('Cannot track new property: transaction has been rolled back')
    }

    tx.createdProperties.push({
        ...property,
        createdAt: new Date().toISOString(),
    })
}

/**
 * Tracks a newly created subscription in the transaction context
 */
export function trackCreatedSubscription(
    tx: TransactionContext,
    subscription: Omit<CreatedSubscription, 'createdAt'>
): void {
    if (tx.isRolledBack) {
        throw new Error('Cannot track new subscription: transaction has been rolled back')
    }

    tx.createdSubscriptions.push({
        ...subscription,
        createdAt: new Date().toISOString(),
    })
}

/**
 * Marks an item as processed for idempotency
 */
export function markItemProcessed(tx: TransactionContext, key: string): void {
    tx.processedItems.add(key)
}

/**
 * Checks if an item has already been processed
 */
export function isItemProcessed(tx: TransactionContext, key: string): boolean {
    return tx.processedItems.has(key)
}

// ============================================================================
// Rollback Operations
// ============================================================================

/**
 * Performs a comprehensive rollback of all created data
 * Rollback order (reverse of creation):
 * 1. Properties (they reference owners)
 * 2. Subscriptions (they reference users)
 * 3. Users table entries
 * 4. Auth users last
 */
export async function rollbackTransaction(
    tx: TransactionContext
): Promise<RollbackResult> {
    // Prevent double rollback
    if (tx.isRolledBack) {
        return {
            success: true,
            details: {
                propertiesAttempted: 0,
                propertiesSucceeded: 0,
                propertiesFailed: [],
                subscriptionsAttempted: 0,
                subscriptionsSucceeded: 0,
                subscriptionsFailed: [],
                ownersAttempted: 0,
                ownersSucceeded: 0,
                ownersFailed: [],
            },
            errors: ['Transaction was already rolled back'],
        }
    }

    tx.isRolledBack = true
    const errors: string[] = []

    const result: RollbackResult['details'] = {
        propertiesAttempted: tx.createdProperties.length,
        propertiesSucceeded: 0,
        propertiesFailed: [],
        subscriptionsAttempted: tx.createdSubscriptions.length,
        subscriptionsSucceeded: 0,
        subscriptionsFailed: [],
        ownersAttempted: 0,
        ownersSucceeded: 0,
        ownersFailed: [],
    }

    console.log(`[Transaction Rollback] Starting rollback for job ${tx.jobId}`)
    console.log(`[Transaction Rollback] Properties to delete: ${tx.createdProperties.length}`)
    console.log(`[Transaction Rollback] Subscriptions to delete: ${tx.createdSubscriptions.length}`)
    console.log(`[Transaction Rollback] Owners to delete: ${tx.createdOwners.length}`)

    // Step 1: Rollback properties (use RPC for database-level cleanup)
    try {
        const { data: rpcResult, error: rpcError } = await supabaseAdmin
            .rpc('rollback_bulk_import_properties', {
                p_job_id: tx.jobId,
            })

        if (rpcError) {
            console.error('[Transaction Rollback] RPC property rollback failed:', rpcError)
            errors.push(`RPC property rollback failed: ${rpcError.message}`)

            // Fallback: Manual deletion
            for (const prop of tx.createdProperties) {
                try {
                    const { error } = await supabaseAdmin
                        .from('properties')
                        .delete()
                        .eq('id', prop.id)

                    if (error) {
                        console.error(`[Transaction Rollback] Failed to delete property ${prop.id}:`, error)
                        result.propertiesFailed.push(prop.id)
                    } else {
                        result.propertiesSucceeded++
                    }
                } catch (e: any) {
                    console.error(`[Transaction Rollback] Exception deleting property ${prop.id}:`, e)
                    result.propertiesFailed.push(prop.id)
                    errors.push(`Property ${prop.id}: ${e.message}`)
                }
            }
        } else if (rpcResult) {
            // RPC returns array of { deleted_property_id, psn, success }
            const rpcArray = rpcResult as Array<{ deleted_property_id: string; psn: string; success: boolean }>
            for (const row of rpcArray) {
                if (row.success) {
                    result.propertiesSucceeded++
                } else {
                    result.propertiesFailed.push(row.deleted_property_id)
                }
            }
        }
    } catch (e: any) {
        console.error('[Transaction Rollback] Property rollback error:', e)
        errors.push(`Property rollback: ${e.message}`)
    }

    // Step 2: Rollback subscriptions
    for (const sub of tx.createdSubscriptions) {
        try {
            const { error } = await supabaseAdmin
                .from('subscriptions')
                .delete()
                .eq('id', sub.id)

            if (error) {
                console.error(`[Transaction Rollback] Failed to delete subscription ${sub.id}:`, error)
                result.subscriptionsFailed.push(sub.id)
                errors.push(`Subscription ${sub.id}: ${error.message}`)
            } else {
                result.subscriptionsSucceeded++
            }
        } catch (e: any) {
            console.error(`[Transaction Rollback] Exception deleting subscription ${sub.id}:`, e)
            result.subscriptionsFailed.push(sub.id)
            errors.push(`Subscription ${sub.id}: ${e.message}`)
        }
    }

    // Step 3: Rollback owners (only those created in this transaction, not pre-existing)
    const newOwners = tx.createdOwners.filter(o => o.password !== '[ALREADY EXISTS]')
    result.ownersAttempted = newOwners.length

    for (const owner of newOwners) {
        try {
            // Delete from users table first (depends on auth.user)
            const { error: userError } = await supabaseAdmin
                .from('users')
                .delete()
                .eq('id', owner.id)

            if (userError) {
                console.error(`[Transaction Rollback] Failed to delete user record ${owner.id}:`, userError)
                errors.push(`User record ${owner.id}: ${userError.message}`)
            }

            // Delete auth user
            const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(owner.id)

            if (authError) {
                console.error(`[Transaction Rollback] Failed to delete auth user ${owner.id}:`, authError)
                result.ownersFailed.push(owner.id)
                errors.push(`Auth user ${owner.id}: ${authError.message}`)
            } else {
                result.ownersSucceeded++
            }
        } catch (e: any) {
            console.error(`[Transaction Rollback] Exception deleting owner ${owner.id}:`, e)
            result.ownersFailed.push(owner.id)
            errors.push(`Owner ${owner.id}: ${e.message}`)
        }
    }

    // Log rollback to audit log
    try {
        await supabaseAdmin.from('bulk_import_audit_log').insert({
            job_id: tx.jobId,
            admin_id: tx.adminUserId,
            action: 'rollback_executed',
            details: {
                properties_rolled_back: result.propertiesSucceeded,
                properties_failed: result.propertiesFailed,
                subscriptions_rolled_back: result.subscriptionsSucceeded,
                subscriptions_failed: result.subscriptionsFailed,
                owners_rolled_back: result.ownersSucceeded,
                owners_failed: result.ownersFailed,
                errors: errors.length > 0 ? errors : undefined,
                transaction_id: tx.jobId,
            },
        })
    } catch (e) {
        console.error('[Transaction Rollback] Failed to log rollback:', e)
    }

    const overallSuccess =
        result.propertiesFailed.length === 0 &&
        result.ownersFailed.length === 0 &&
        result.subscriptionsFailed.length === 0

    console.log(`[Transaction Rollback] Completed. Success: ${overallSuccess}`)
    console.log(`[Transaction Rollback] Properties: ${result.propertiesSucceeded}/${result.propertiesAttempted}`)
    console.log(`[Transaction Rollback] Subscriptions: ${result.subscriptionsSucceeded}/${result.subscriptionsAttempted}`)
    console.log(`[Transaction Rollback] Owners: ${result.ownersSucceeded}/${result.ownersAttempted}`)

    return {
        success: overallSuccess,
        details: result,
        errors,
    }
}

/**
 * Performs a partial rollback for a specific batch
 * Useful when a batch fails but previous batches succeeded
 */
export async function rollbackBatch(
    tx: TransactionContext,
    batchProperties: string[],
    batchSubscriptions: string[],
    batchOwners: string[]
): Promise<RollbackResult> {
    const errors: string[] = []

    const result: RollbackResult['details'] = {
        propertiesAttempted: batchProperties.length,
        propertiesSucceeded: 0,
        propertiesFailed: [],
        subscriptionsAttempted: batchSubscriptions.length,
        subscriptionsSucceeded: 0,
        subscriptionsFailed: [],
        ownersAttempted: 0,
        ownersSucceeded: 0,
        ownersFailed: [],
    }

    // Delete properties in batch
    for (const propId of batchProperties) {
        try {
            const { error } = await supabaseAdmin
                .from('properties')
                .delete()
                .eq('id', propId)

            if (error) {
                result.propertiesFailed.push(propId)
                errors.push(`Property ${propId}: ${error.message}`)
            } else {
                result.propertiesSucceeded++
                // Remove from transaction context
                const idx = tx.createdProperties.findIndex(p => p.id === propId)
                if (idx !== -1) tx.createdProperties.splice(idx, 1)
            }
        } catch (e: any) {
            result.propertiesFailed.push(propId)
            errors.push(`Property ${propId}: ${e.message}`)
        }
    }

    // Delete subscriptions in batch
    for (const subId of batchSubscriptions) {
        try {
            const { error } = await supabaseAdmin
                .from('subscriptions')
                .delete()
                .eq('id', subId)

            if (error) {
                result.subscriptionsFailed.push(subId)
                errors.push(`Subscription ${subId}: ${error.message}`)
            } else {
                result.subscriptionsSucceeded++
                const idx = tx.createdSubscriptions.findIndex(s => s.id === subId)
                if (idx !== -1) tx.createdSubscriptions.splice(idx, 1)
            }
        } catch (e: any) {
            result.subscriptionsFailed.push(subId)
            errors.push(`Subscription ${subId}: ${e.message}`)
        }
    }

    // Delete owners in batch
    const newOwners = tx.createdOwners.filter(
        o => batchOwners.includes(o.id) && o.password !== '[ALREADY EXISTS]'
    )
    result.ownersAttempted = newOwners.length

    for (const owner of newOwners) {
        try {
            await supabaseAdmin.from('users').delete().eq('id', owner.id)
            const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(owner.id)

            if (authError) {
                result.ownersFailed.push(owner.id)
                errors.push(`Owner ${owner.id}: ${authError.message}`)
            } else {
                result.ownersSucceeded++
                const idx = tx.createdOwners.findIndex(o => o.id === owner.id)
                if (idx !== -1) tx.createdOwners.splice(idx, 1)
            }
        } catch (e: any) {
            result.ownersFailed.push(owner.id)
            errors.push(`Owner ${owner.id}: ${e.message}`)
        }
    }

    return {
        success: errors.length === 0,
        details: result,
        errors,
    }
}

// ============================================================================
// Batch Processing with Automatic Rollback
// ============================================================================

/**
 * Executes a batch of operations with automatic rollback on failure
 */
export async function executeWithRollback<T>(
    tx: TransactionContext,
    operation: () => Promise<T>,
    onSuccess: (result: T) => void,
    onRollback: (error: Error) => void
): Promise<BatchResult<T>> {
    // Store snapshot of current state for potential rollback
    const snapshot = {
        propertiesCount: tx.createdProperties.length,
        subscriptionsCount: tx.createdSubscriptions.length,
        ownersCount: tx.createdOwners.length,
    }

    try {
        const result = await operation()
        onSuccess(result)
        return { success: true, data: result }
    } catch (error: any) {
        console.error('[Transaction] Operation failed, rolling back batch:', error)

        // Determine what was created in this batch
        const batchProperties = tx.createdProperties.slice(snapshot.propertiesCount).map(p => p.id)
        const batchSubscriptions = tx.createdSubscriptions.slice(snapshot.subscriptionsCount).map(s => s.id)
        const batchOwners = tx.createdOwners.slice(snapshot.ownersCount).map(o => o.id)

        // Perform partial rollback
        const rollbackResult = await rollbackBatch(
            tx,
            batchProperties,
            batchSubscriptions,
            batchOwners
        )

        console.log('[Transaction] Batch rollback result:', rollbackResult)

        onRollback(error)
        return {
            success: false,
            error: error.message,
            rolledBack: rollbackResult.success,
        }
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Gets the current transaction statistics
 */
export function getTransactionStats(tx: TransactionContext): {
    ownersCreated: number
    propertiesCreated: number
    subscriptionsCreated: number
    itemsProcessed: number
    isRolledBack: boolean
} {
    return {
        ownersCreated: tx.createdOwners.length,
        propertiesCreated: tx.createdProperties.length,
        subscriptionsCreated: tx.createdSubscriptions.length,
        itemsProcessed: tx.processedItems.size,
        isRolledBack: tx.isRolledBack,
    }
}

/**
 * Validates that the transaction is in a valid state for new operations
 */
export function validateTransactionState(tx: TransactionContext): {
    valid: boolean
    error?: string
} {
    if (tx.isRolledBack) {
        return { valid: false, error: 'Transaction has been rolled back' }
    }

    if (!tx.jobId) {
        return { valid: false, error: 'Transaction missing job ID' }
    }

    if (!tx.adminUserId) {
        return { valid: false, error: 'Transaction missing admin user ID' }
    }

    return { valid: true }
}

/**
 * Clears all tracked data from transaction context
 * Use with caution - only when you're sure the data should not be rolled back
 */
export function clearTransaction(tx: TransactionContext): void {
    tx.createdOwners = []
    tx.createdProperties = []
    tx.createdSubscriptions = []
    tx.processedItems.clear()
}
