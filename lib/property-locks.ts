/**
 * Property Locks - Database-Level Concurrent Edit Protection
 *
 * This module provides distributed locking for property operations,
 * replacing the in-memory approvalLocks that don't work across
 * Vercel serverless instances.
 *
 * Features:
 * - Distributed locking via PostgreSQL/Supabase
 * - Automatic lock expiration (timeout mechanism)
 * - Lock ownership tracking
 * - Graceful handling of lock acquisition failures
 *
 * @example
 * ```typescript
 * import { acquirePropertyLock, releasePropertyLock } from '@/lib/property-locks'
 *
 * // In your API route
 * const lockResult = await acquirePropertyLock(propertyId, adminId, 30)
 * if (!lockResult.success) {
 *   return NextResponse.json(
 *     { error: lockResult.error },
 *     { status: 423 } // Locked
 *   )
 * }
 *
 * try {
 *   // Perform your operation
 *   await updateProperty(propertyId, data)
 * } finally {
 *   await releasePropertyLock(propertyId, adminId)
 * }
 * ```
 */

import { supabaseAdmin } from '@/lib/supabase-admin'

// ============================================================================
// TYPES
// ============================================================================

export type LockType = 'edit' | 'approve' | 'reject' | 'verify' | 'type_change' | 'delete'

export interface LockResult {
  success: boolean
  error?: string
  propertyId?: string
  adminId?: string
  lockType?: LockType
  expiresAt?: string
  secondsRemaining?: number
  extended?: boolean
  released?: boolean
  wasExpired?: boolean
}

export interface LockStatus {
  success: boolean
  error?: string
  locked: boolean
  expired?: boolean
  propertyId?: string
  lockedByAdminId?: string
  lockedAt?: string
  expiresAt?: string
  secondsRemaining?: number
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Default lock timeout in seconds (30 seconds) */
export const DEFAULT_LOCK_TIMEOUT_SECONDS = 30

/** Maximum lock timeout in seconds (5 minutes) */
export const MAX_LOCK_TIMEOUT_SECONDS = 300

/** Lock type mapping for different operations */
const OPERATION_LOCK_TYPES: Record<string, LockType> = {
  approve: 'approve',
  reject: 'reject',
  verify: 'verify',
  type: 'type_change',
  delete: 'delete',
  edit: 'edit',
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Acquire a distributed lock on a property.
 *
 * This function attempts to acquire a lock on a property. If successful,
 * the caller has exclusive rights to modify the property until the lock
 * expires or is released.
 *
 * If the same admin already holds a lock, it will be extended.
 * If a different admin holds the lock, the acquisition will fail.
 *
 * @param propertyId - The UUID of the property to lock
 * @param adminId - The UUID of the admin acquiring the lock
 * @param timeoutSeconds - Lock duration in seconds (1-300, default: 30)
 * @param lockType - Type of lock operation (default: 'edit')
 * @returns LockResult with success status and details
 *
 * @example
 * ```typescript
 * const result = await acquirePropertyLock('prop-123', 'admin-456', 60, 'approve')
 * if (result.success) {
 *   console.log('Lock acquired, expires at:', result.expiresAt)
 * } else {
 *   console.error('Failed to acquire lock:', result.error)
 * }
 * ```
 */
export async function acquirePropertyLock(
  propertyId: string,
  adminId: string,
  timeoutSeconds: number = DEFAULT_LOCK_TIMEOUT_SECONDS,
  lockType: LockType = 'edit'
): Promise<LockResult> {
  try {
    // Validate inputs
    if (!propertyId || !isValidUUID(propertyId)) {
      return {
        success: false,
        error: 'Invalid property ID',
      }
    }

    if (!adminId || !isValidUUID(adminId)) {
      return {
        success: false,
        error: 'Invalid admin ID',
      }
    }

    // Clamp timeout to valid range
    const clampedTimeout = Math.max(
      1,
      Math.min(timeoutSeconds, MAX_LOCK_TIMEOUT_SECONDS)
    )

    const { data, error } = await supabaseAdmin.rpc('acquire_property_lock', {
      p_property_id: propertyId,
      p_admin_id: adminId,
      p_lock_type: lockType,
      p_timeout_seconds: clampedTimeout,
    })

    if (error) {
      console.error('[PropertyLocks] RPC error acquiring lock:', error)
      return {
        success: false,
        error: `Database error: ${error.message}`,
      }
    }

    const result = data as {
      success: boolean
      error?: string
      property_id?: string
      admin_id?: string
      lock_type?: LockType
      expires_at?: string
      seconds_remaining?: number
      extended?: boolean
      message?: string
    }

    return {
      success: result.success,
      error: result.error,
      propertyId: result.property_id,
      adminId: result.admin_id,
      lockType: result.lock_type,
      expiresAt: result.expires_at,
      secondsRemaining: result.seconds_remaining,
      extended: result.extended,
    }
  } catch (err: any) {
    console.error('[PropertyLocks] Unexpected error acquiring lock:', err)
    return {
      success: false,
      error: `Unexpected error: ${err?.message || 'Unknown error'}`,
    }
  }
}

/**
 * Release a distributed lock on a property.
 *
 * This function releases a lock held by an admin. It should be called
 * in a finally block to ensure locks are always released.
 *
 * Only the admin who acquired the lock can release it.
 *
 * @param propertyId - The UUID of the property
 * @param adminId - The UUID of the admin releasing the lock
 * @param lockType - Type of lock operation (default: 'edit')
 * @returns LockResult with success status
 *
 * @example
 * ```typescript
 * try {
 *   await acquirePropertyLock(propertyId, adminId)
 *   // ... do work ...
 * } finally {
 *   await releasePropertyLock(propertyId, adminId)
 * }
 * ```
 */
export async function releasePropertyLock(
  propertyId: string,
  adminId: string,
  lockType: LockType = 'edit'
): Promise<LockResult> {
  try {
    if (!propertyId || !adminId) {
      return {
        success: false,
        error: 'Property ID and Admin ID are required',
      }
    }

    const { data, error } = await supabaseAdmin.rpc('release_property_lock', {
      p_property_id: propertyId,
      p_admin_id: adminId,
      p_lock_type: lockType,
    })

    if (error) {
      console.error('[PropertyLocks] RPC error releasing lock:', error)
      return {
        success: false,
        error: `Database error: ${error.message}`,
      }
    }

    const result = data as {
      success: boolean
      error?: string
      message?: string
      released?: boolean
      was_expired?: boolean
      property_id?: string
    }

    return {
      success: result.success,
      error: result.error,
      released: result.released,
      wasExpired: result.was_expired,
      propertyId: result.property_id,
    }
  } catch (err: any) {
    console.error('[PropertyLocks] Unexpected error releasing lock:', err)
    return {
      success: false,
      error: `Unexpected error: ${err?.message || 'Unknown error'}`,
    }
  }
}

/**
 * Extend the expiration time of an existing lock.
 *
 * This function extends the duration of a lock held by an admin.
 * Useful for long-running operations.
 *
 * @param propertyId - The UUID of the property
 * @param adminId - The UUID of the admin extending the lock
 * @param additionalSeconds - Additional time in seconds (1-300)
 * @param lockType - Type of lock operation (default: 'edit')
 * @returns LockResult with success status and new expiration
 *
 * @example
 * ```typescript
 * const result = await extendPropertyLock(propertyId, adminId, 30)
 * if (result.success) {
 *   console.log('Lock extended until:', result.expiresAt)
 * }
 * ```
 */
export async function extendPropertyLock(
  propertyId: string,
  adminId: string,
  additionalSeconds: number = DEFAULT_LOCK_TIMEOUT_SECONDS,
  lockType: LockType = 'edit'
): Promise<LockResult> {
  try {
    if (!propertyId || !adminId) {
      return {
        success: false,
        error: 'Property ID and Admin ID are required',
      }
    }

    const clampedSeconds = Math.max(
      1,
      Math.min(additionalSeconds, MAX_LOCK_TIMEOUT_SECONDS)
    )

    const { data, error } = await supabaseAdmin.rpc('extend_property_lock', {
      p_property_id: propertyId,
      p_admin_id: adminId,
      p_lock_type: lockType,
      p_additional_seconds: clampedSeconds,
    })

    if (error) {
      console.error('[PropertyLocks] RPC error extending lock:', error)
      return {
        success: false,
        error: `Database error: ${error.message}`,
      }
    }

    const result = data as {
      success: boolean
      error?: string
      message?: string
      property_id?: string
      new_expires_at?: string
      extended?: boolean
      extended_by_seconds?: number
    }

    return {
      success: result.success,
      error: result.error,
      propertyId: result.property_id,
      expiresAt: result.new_expires_at,
      extended: result.extended,
    }
  } catch (err: any) {
    console.error('[PropertyLocks] Unexpected error extending lock:', err)
    return {
      success: false,
      error: `Unexpected error: ${err?.message || 'Unknown error'}`,
    }
  }
}

/**
 * Get the current lock status for a property.
 *
 * This function checks if a property is currently locked and returns
 * information about the lock.
 *
 * @param propertyId - The UUID of the property
 * @param lockType - Type of lock operation (default: 'edit')
 * @returns LockStatus with lock information
 *
 * @example
 * ```typescript
 * const status = await getPropertyLockStatus(propertyId)
 * if (status.locked) {
 *   console.log(`Locked by ${status.lockedByAdminId}, expires in ${status.secondsRemaining}s`)
 * }
 * ```
 */
export async function getPropertyLockStatus(
  propertyId: string,
  lockType: LockType = 'edit'
): Promise<LockStatus> {
  try {
    if (!propertyId) {
      return {
        success: false,
        error: 'Property ID is required',
        locked: false,
      }
    }

    const { data, error } = await supabaseAdmin.rpc('get_property_lock_status', {
      p_property_id: propertyId,
      p_lock_type: lockType,
    })

    if (error) {
      console.error('[PropertyLocks] RPC error getting lock status:', error)
      return {
        success: false,
        error: `Database error: ${error.message}`,
        locked: false,
      }
    }

    const result = data as {
      success: boolean
      error?: string
      locked: boolean
      expired?: boolean
      property_id?: string
      locked_by_admin_id?: string
      locked_at?: string
      expires_at?: string
      seconds_remaining?: number
    }

    return {
      success: result.success,
      error: result.error,
      locked: result.locked,
      expired: result.expired,
      propertyId: result.property_id,
      lockedByAdminId: result.locked_by_admin_id,
      lockedAt: result.locked_at,
      expiresAt: result.expires_at,
      secondsRemaining: result.seconds_remaining,
    }
  } catch (err: any) {
    console.error('[PropertyLocks] Unexpected error getting lock status:', err)
    return {
      success: false,
      error: `Unexpected error: ${err?.message || 'Unknown error'}`,
      locked: false,
    }
  }
}

/**
 * Cleanup all expired locks.
 *
 * This function removes all expired locks from the database.
 * Should be called periodically (e.g., via a cron job).
 *
 * @returns Number of expired locks removed
 *
 * @example
 * ```typescript
 * const cleaned = await cleanupExpiredLocks()
 * console.log(`Cleaned up ${cleaned} expired locks`)
 * ```
 */
export async function cleanupExpiredLocks(): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin.rpc('cleanup_expired_locks')

    if (error) {
      console.error('[PropertyLocks] RPC error cleaning up locks:', error)
      return 0
    }

    return data as number
  } catch (err: any) {
    console.error('[PropertyLocks] Unexpected error cleaning up locks:', err)
    return 0
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Execute a function with a property lock.
 *
 * This is a higher-order function that automatically acquires a lock,
 * executes the provided function, and releases the lock afterwards.
 *
 * @param propertyId - The UUID of the property
 * @param adminId - The UUID of the admin
 * @param operation - The function to execute while holding the lock
 * @param timeoutSeconds - Lock duration in seconds
 * @param lockType - Type of lock operation
 * @returns The result of the operation function, or null if lock acquisition failed
 *
 * @example
 * ```typescript
 * const result = await withPropertyLock(
 *   propertyId,
 *   adminId,
 *   async () => {
 *     // This code runs while holding the lock
 *     return await updateProperty(propertyId, data)
 *   },
 *   60,
 *   'edit'
 * )
 * ```
 */
export async function withPropertyLock<T>(
  propertyId: string,
  adminId: string,
  operation: () => Promise<T>,
  timeoutSeconds: number = DEFAULT_LOCK_TIMEOUT_SECONDS,
  lockType: LockType = 'edit'
): Promise<{ success: boolean; result?: T; error?: string }> {
  const lockResult = await acquirePropertyLock(propertyId, adminId, timeoutSeconds, lockType)

  if (!lockResult.success) {
    return {
      success: false,
      error: lockResult.error || 'Failed to acquire lock',
    }
  }

  try {
    const result = await operation()
    return {
      success: true,
      result,
    }
  } finally {
    await releasePropertyLock(propertyId, adminId, lockType)
  }
}

/**
 * Get the lock type for an operation.
 *
 * @param operation - The operation name (e.g., 'approve', 'reject')
 * @returns The corresponding LockType
 */
export function getLockTypeForOperation(operation: string): LockType {
  return OPERATION_LOCK_TYPES[operation] || 'edit'
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate UUID format.
 */
function isValidUUID(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}
