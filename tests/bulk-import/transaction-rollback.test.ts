import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the supabase-admin module
vi.mock('@/lib/supabase-admin', () => ({
    supabaseAdmin: {
        from: vi.fn(() => ({
            delete: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
            insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => ({ data: { id: 'test-id' }, error: null })) })) })),
            update: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
            select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => ({ data: null, error: null })), single: vi.fn(() => ({ data: null, error: null })) })) })),
            upsert: vi.fn(() => ({ error: null })),
        })),
        rpc: vi.fn(() => ({ data: null, error: null })),
        auth: {
            admin: {
                deleteUser: vi.fn(() => ({ error: null })),
                createUser: vi.fn(() => ({ data: { user: { id: 'test-user-id' } }, error: null })),
                listUsers: vi.fn(() => ({ data: { users: [] }, error: null })),
            },
        },
    },
}))

// Import after mocking
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
    createTransactionContext,
    trackCreatedOwner,
    trackCreatedProperty,
    trackCreatedSubscription,
    markItemProcessed,
    isItemProcessed,
    shouldSimulateFailure,
    rollbackTransaction,
    rollbackBatch,
    validateTransactionState,
    getTransactionStats,
    clearTransaction,
    type TransactionContext,
} from '@/lib/bulk-import-transaction'

describe('Bulk Import Transaction Management', () => {
    let tx: TransactionContext

    beforeEach(() => {
        vi.clearAllMocks()
        tx = createTransactionContext('test-job-id', 'test-admin-id')
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('Transaction Context Creation', () => {
        it('should create a transaction context with correct initial state', () => {
            expect(tx.jobId).toBe('test-job-id')
            expect(tx.adminUserId).toBe('test-admin-id')
            expect(tx.createdOwners).toEqual([])
            expect(tx.createdProperties).toEqual([])
            expect(tx.createdSubscriptions).toEqual([])
            expect(tx.processedItems.size).toBe(0)
            expect(tx.isRolledBack).toBe(false)
        })

        it('should create a transaction context with failure simulation config', () => {
            const txWithSim = createTransactionContext('job-1', 'admin-1', {
                enabled: true,
                failAtBatch: 2,
                failOperation: 'owner',
            })

            expect(txWithSim.failureSimulation).toBeDefined()
            expect(txWithSim.failureSimulation?.enabled).toBe(true)
            expect(txWithSim.failureSimulation?.failAtBatch).toBe(2)
            expect(txWithSim.failureSimulation?.failOperation).toBe('owner')
        })
    })

    describe('Record Tracking', () => {
        it('should track created owners', () => {
            trackCreatedOwner(tx, {
                email: 'owner@test.com',
                id: 'owner-1',
                password: 'secure-password',
            })

            expect(tx.createdOwners).toHaveLength(1)
            expect(tx.createdOwners[0].email).toBe('owner@test.com')
            expect(tx.createdOwners[0].id).toBe('owner-1')
            expect(tx.createdOwners[0].password).toBe('secure-password')
            expect(tx.createdOwners[0].createdAt).toBeDefined()
        })

        it('should track created properties', () => {
            trackCreatedProperty(tx, {
                id: 'prop-1',
                psn: '1053',
                ownerId: 'owner-1',
            })

            expect(tx.createdProperties).toHaveLength(1)
            expect(tx.createdProperties[0].id).toBe('prop-1')
            expect(tx.createdProperties[0].psn).toBe('1053')
            expect(tx.createdProperties[0].ownerId).toBe('owner-1')
        })

        it('should track created subscriptions', () => {
            trackCreatedSubscription(tx, {
                id: 'sub-1',
                userId: 'user-1',
            })

            expect(tx.createdSubscriptions).toHaveLength(1)
            expect(tx.createdSubscriptions[0].id).toBe('sub-1')
            expect(tx.createdSubscriptions[0].userId).toBe('user-1')
        })

        it('should throw error when tracking after rollback', () => {
            tx.isRolledBack = true

            expect(() => {
                trackCreatedOwner(tx, { email: 'test@test.com', id: '1', password: 'pass' })
            }).toThrow('Cannot track new owner: transaction has been rolled back')
        })
    })

    describe('Item Processing Tracking', () => {
        it('should mark items as processed', () => {
            markItemProcessed(tx, 'owner:test@example.com')
            expect(tx.processedItems.has('owner:test@example.com')).toBe(true)
        })

        it('should check if item is processed', () => {
            markItemProcessed(tx, 'property:1053')
            expect(isItemProcessed(tx, 'property:1053')).toBe(true)
            expect(isItemProcessed(tx, 'property:1054')).toBe(false)
        })
    })

    describe('Failure Simulation', () => {
        it('should not simulate failure when disabled', () => {
            const result = shouldSimulateFailure(tx, 'owner', 1, 1)
            expect(result).toBe(false)
        })

        it('should simulate failure at specific batch', () => {
            tx.failureSimulation = {
                enabled: true,
                failAtBatch: 2,
                failOperation: 'owner',
            }

            expect(shouldSimulateFailure(tx, 'owner', 1, 1)).toBe(false)
            expect(shouldSimulateFailure(tx, 'owner', 2, 1)).toBe(true)
            expect(shouldSimulateFailure(tx, 'property', 2, 1)).toBe(false) // Different operation
        })

        it('should simulate failure at specific item', () => {
            tx.failureSimulation = {
                enabled: true,
                failAtItem: 3,
                failOperation: 'property',
            }

            expect(shouldSimulateFailure(tx, 'property', 1, 1)).toBe(false)
            expect(shouldSimulateFailure(tx, 'property', 1, 3)).toBe(true)
        })

        it('should simulate failure after specific count', () => {
            tx.failureSimulation = {
                enabled: true,
                failAfterCount: 3,
            }

            // Initially 0 items created
            expect(shouldSimulateFailure(tx, 'owner')).toBe(false)

            // Add 3 items
            trackCreatedOwner(tx, { email: '1@test.com', id: '1', password: 'pass' })
            trackCreatedProperty(tx, { id: 'p1', psn: '1', ownerId: '1' })
            trackCreatedSubscription(tx, { id: 's1', userId: '1' })

            // Now should fail
            expect(shouldSimulateFailure(tx, 'owner')).toBe(true)
        })
    })

    describe('Transaction State Validation', () => {
        it('should validate valid transaction state', () => {
            const result = validateTransactionState(tx)
            expect(result.valid).toBe(true)
            expect(result.error).toBeUndefined()
        })

        it('should invalidate rolled back transaction', () => {
            tx.isRolledBack = true
            const result = validateTransactionState(tx)
            expect(result.valid).toBe(false)
            expect(result.error).toBe('Transaction has been rolled back')
        })

        it('should invalidate transaction without job ID', () => {
            tx.jobId = ''
            const result = validateTransactionState(tx)
            expect(result.valid).toBe(false)
            expect(result.error).toBe('Transaction missing job ID')
        })

        it('should invalidate transaction without admin ID', () => {
            tx.adminUserId = ''
            const result = validateTransactionState(tx)
            expect(result.valid).toBe(false)
            expect(result.error).toBe('Transaction missing admin user ID')
        })
    })

    describe('Transaction Statistics', () => {
        it('should return correct statistics', () => {
            trackCreatedOwner(tx, { email: '1@test.com', id: '1', password: 'pass' })
            trackCreatedOwner(tx, { email: '2@test.com', id: '2', password: 'pass' })
            trackCreatedProperty(tx, { id: 'p1', psn: '1', ownerId: '1' })
            markItemProcessed(tx, 'key1')
            markItemProcessed(tx, 'key2')

            const stats = getTransactionStats(tx)

            expect(stats.ownersCreated).toBe(2)
            expect(stats.propertiesCreated).toBe(1)
            expect(stats.subscriptionsCreated).toBe(0)
            expect(stats.itemsProcessed).toBe(2)
            expect(stats.isRolledBack).toBe(false)
        })
    })

    describe('Clear Transaction', () => {
        it('should clear all tracked data', () => {
            trackCreatedOwner(tx, { email: '1@test.com', id: '1', password: 'pass' })
            trackCreatedProperty(tx, { id: 'p1', psn: '1', ownerId: '1' })
            trackCreatedSubscription(tx, { id: 's1', userId: '1' })
            markItemProcessed(tx, 'key1')

            clearTransaction(tx)

            expect(tx.createdOwners).toHaveLength(0)
            expect(tx.createdProperties).toHaveLength(0)
            expect(tx.createdSubscriptions).toHaveLength(0)
            expect(tx.processedItems.size).toBe(0)
        })
    })

    describe('Rollback Batch', () => {
        it('should rollback a batch of properties', async () => {
            // Setup initial data
            trackCreatedProperty(tx, { id: 'p1', psn: '1', ownerId: '1' })
            trackCreatedProperty(tx, { id: 'p2', psn: '2', ownerId: '1' })
            trackCreatedProperty(tx, { id: 'p3', psn: '3', ownerId: '2' })

            const result = await rollbackBatch(tx, ['p2', 'p3'], [], [])

            expect(result.success).toBe(true)
            expect(result.details.propertiesAttempted).toBe(2)
            expect(result.details.propertiesSucceeded).toBe(2)
            expect(tx.createdProperties).toHaveLength(1) // Only p1 remains
            expect(tx.createdProperties[0].id).toBe('p1')
        })

        it('should rollback a batch of owners and subscriptions', async () => {
            trackCreatedOwner(tx, { email: '1@test.com', id: 'u1', password: 'pass' })
            trackCreatedOwner(tx, { email: '2@test.com', id: 'u2', password: 'pass' })
            trackCreatedSubscription(tx, { id: 's1', userId: 'u1' })
            trackCreatedSubscription(tx, { id: 's2', userId: 'u2' })

            const result = await rollbackBatch(tx, [], ['s2'], ['u2'])

            expect(result.success).toBe(true)
            expect(result.details.subscriptionsAttempted).toBe(1)
            expect(result.details.ownersAttempted).toBe(1)
            expect(tx.createdOwners).toHaveLength(1)
            expect(tx.createdSubscriptions).toHaveLength(1)
        })

        it('should not rollback pre-existing owners', async () => {
            trackCreatedOwner(tx, { email: 'existing@test.com', id: 'u1', password: '[ALREADY EXISTS]' })
            trackCreatedOwner(tx, { email: 'new@test.com', id: 'u2', password: 'newpass' })

            const result = await rollbackBatch(tx, [], [], ['u1', 'u2'])

            expect(result.details.ownersAttempted).toBe(1) // Only u2
            expect(result.details.ownersSucceeded).toBe(1)
        })

        it('should handle rollback errors gracefully', async () => {
            // Mock delete to fail
            vi.mocked(supabaseAdmin.from).mockReturnValue({
                delete: vi.fn(() => ({
                    eq: vi.fn(() => ({ error: new Error('Delete failed') })),
                })),
            } as any)

            trackCreatedProperty(tx, { id: 'p1', psn: '1', ownerId: '1' })

            const result = await rollbackBatch(tx, ['p1'], [], [])

            expect(result.success).toBe(false)
            expect(result.details.propertiesFailed).toContain('p1')
            expect(result.errors.length).toBeGreaterThan(0)

            // Reset mock to default behavior for subsequent tests
            vi.mocked(supabaseAdmin.from).mockReturnValue({
                delete: vi.fn(() => ({
                    eq: vi.fn(() => ({ error: null })),
                })),
            } as any)
        })
    })

    describe('Full Transaction Rollback', () => {
        it('should prevent double rollback', async () => {
            tx.isRolledBack = true

            const result = await rollbackTransaction(tx)

            expect(result.success).toBe(true)
            expect(result.errors).toContain('Transaction was already rolled back')
            expect(supabaseAdmin.from).not.toHaveBeenCalled()
        })

        it('should rollback all created data', async () => {
            // Setup data
            trackCreatedOwner(tx, { email: '1@test.com', id: 'u1', password: 'pass' })
            trackCreatedOwner(tx, { email: '2@test.com', id: 'u2', password: 'pass' })
            trackCreatedProperty(tx, { id: 'p1', psn: '1', ownerId: 'u1' })
            trackCreatedProperty(tx, { id: 'p2', psn: '2', ownerId: 'u2' })
            trackCreatedSubscription(tx, { id: 's1', userId: 'u1' })

            const result = await rollbackTransaction(tx)

            expect(result.success).toBe(true)
            expect(tx.isRolledBack).toBe(true)
            expect(result.details.propertiesAttempted).toBe(2)
            expect(result.details.ownersAttempted).toBe(2)
            expect(result.details.subscriptionsAttempted).toBe(1)
        })

        it('should use RPC for property rollback when available', async () => {
            const mockRpcResult = [
                { deleted_property_id: 'p1', psn: '1', success: true },
                { deleted_property_id: 'p2', psn: '2', success: true },
            ]

            vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
                data: mockRpcResult,
                error: null,
            } as any)

            trackCreatedProperty(tx, { id: 'p1', psn: '1', ownerId: 'u1' })
            trackCreatedProperty(tx, { id: 'p2', psn: '2', ownerId: 'u2' })

            const result = await rollbackTransaction(tx)

            expect(supabaseAdmin.rpc).toHaveBeenCalledWith('rollback_bulk_import_properties', {
                p_job_id: 'test-job-id',
            })
            expect(result.details.propertiesSucceeded).toBe(2)
        })

        it('should fallback to manual deletion when RPC fails', async () => {
            vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
                data: null,
                error: new Error('RPC failed'),
            } as any)

            trackCreatedProperty(tx, { id: 'p1', psn: '1', ownerId: 'u1' })

            const result = await rollbackTransaction(tx)

            expect(supabaseAdmin.from).toHaveBeenCalledWith('properties')
            expect(result.details.propertiesAttempted).toBe(1)
        })

        it('should log rollback to audit log', async () => {
            trackCreatedProperty(tx, { id: 'p1', psn: '1', ownerId: 'u1' })

            await rollbackTransaction(tx)

            expect(supabaseAdmin.from).toHaveBeenCalledWith('bulk_import_audit_log')
        })
    })
})

describe('Transaction Rollback Integration', () => {
    beforeEach(() => {
        // Reset mocks to default success behavior
        vi.mocked(supabaseAdmin.from).mockReturnValue({
            delete: vi.fn(() => ({
                eq: vi.fn(() => ({ error: null })),
            })),
            insert: vi.fn(() => ({
                select: vi.fn(() => ({
                    single: vi.fn(() => ({ data: { id: 'test-id' }, error: null })),
                })),
            })),
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    maybeSingle: vi.fn(() => ({ data: null, error: null })),
                    single: vi.fn(() => ({ data: null, error: null })),
                })),
            })),
        } as any)

        vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
            data: null,
            error: null,
        } as any)
    })

    it('should handle complete import flow with rollback on failure', async () => {
        // This test simulates a complete import flow where a critical failure occurs
        // and all data is rolled back

        const tx = createTransactionContext('job-123', 'admin-456', {
            enabled: true,
            failAtBatch: 1,
            failOperation: 'property',
        })

        // Simulate creating owners successfully
        trackCreatedOwner(tx, { email: 'owner1@test.com', id: 'u1', password: 'pass1' })
        trackCreatedOwner(tx, { email: 'owner2@test.com', id: 'u2', password: 'pass2' })
        trackCreatedSubscription(tx, { id: 's1', userId: 'u1' })
        trackCreatedSubscription(tx, { id: 's2', userId: 'u2' })

        // Simulate creating some properties before failure
        trackCreatedProperty(tx, { id: 'p1', psn: '1001', ownerId: 'u1' })
        trackCreatedProperty(tx, { id: 'p2', psn: '1002', ownerId: 'u2' })

        // Verify failure simulation triggers
        expect(shouldSimulateFailure(tx, 'property', 1, 0)).toBe(true)

        // Perform full rollback
        const rollbackResult = await rollbackTransaction(tx)

        expect(rollbackResult.success).toBe(true)
        expect(tx.isRolledBack).toBe(true)
        expect(rollbackResult.details.ownersAttempted).toBe(2)
        expect(rollbackResult.details.propertiesAttempted).toBe(2)
        expect(rollbackResult.details.subscriptionsAttempted).toBe(2)
    })

    it('should handle partial batch rollback during import', async () => {
        const tx = createTransactionContext('job-789', 'admin-123')

        // Simulate processing batch 1 successfully
        trackCreatedOwner(tx, { email: 'batch1@test.com', id: 'u1', password: 'pass1' })
        trackCreatedProperty(tx, { id: 'p1', psn: '1001', ownerId: 'u1' })

        // Batch 2 starts and fails mid-way
        const batch2Owners = ['u2', 'u3']
        const batch2Props = ['p2']
        const batch2Subs = ['s2']

        trackCreatedOwner(tx, { email: 'batch2a@test.com', id: 'u2', password: 'pass2' })
        trackCreatedOwner(tx, { email: 'batch2b@test.com', id: 'u3', password: 'pass3' })
        trackCreatedProperty(tx, { id: 'p2', psn: '1002', ownerId: 'u2' })
        trackCreatedSubscription(tx, { id: 's2', userId: 'u2' })

        // Rollback only batch 2
        const rollbackResult = await rollbackBatch(tx, batch2Props, batch2Subs, batch2Owners)

        expect(rollbackResult.success).toBe(true)
        expect(tx.createdOwners).toHaveLength(1) // Only batch 1 owner remains
        expect(tx.createdProperties).toHaveLength(1) // Only batch 1 property remains
        expect(tx.createdOwners[0].id).toBe('u1')
    })
})

describe('Transaction Edge Cases', () => {
    it('should handle empty transaction rollback', async () => {
        const tx = createTransactionContext('empty-job', 'admin-1')

        const result = await rollbackTransaction(tx)

        expect(result.success).toBe(true)
        expect(result.details.ownersAttempted).toBe(0)
        expect(result.details.propertiesAttempted).toBe(0)
        expect(result.details.subscriptionsAttempted).toBe(0)
    })

    it('should handle rollback with only pre-existing owners', async () => {
        const tx = createTransactionContext('job-1', 'admin-1')

        trackCreatedOwner(tx, { email: 'existing@test.com', id: 'u1', password: '[ALREADY EXISTS]' })

        const result = await rollbackTransaction(tx)

        expect(result.details.ownersAttempted).toBe(0) // Pre-existing owners are not deleted
        expect(result.details.ownersSucceeded).toBe(0)
    })

    it('should handle concurrent modification protection', () => {
        const tx = createTransactionContext('job-1', 'admin-1')

        trackCreatedOwner(tx, { email: 'test@test.com', id: 'u1', password: 'pass' })

        // Simulate concurrent modification attempt after rollback
        tx.isRolledBack = true

        expect(() => {
            trackCreatedProperty(tx, { id: 'p1', psn: '1', ownerId: 'u1' })
        }).toThrow('Cannot track new property: transaction has been rolled back')
    })
})
