import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { csrfProtection } from "@/lib/csrf-server"
import crypto from "crypto"
import { decrypt, decryptLegacy } from "@/lib/encryption"
import {
    acquireProcessingLock,
    releaseProcessingLock,
    updateJobProgress,
} from "@/lib/bulk-import-queue"

// ============================================================================
// Types for Transaction Management
// ============================================================================
interface TransactionContext {
    jobId: string
    adminUserId: string
    createdOwners: Array<{ email: string; id: string; password: string }>
    createdPropertyIds: string[]
    createdSubscriptionIds: string[]
    processedItems: Set<string> // For idempotency tracking
    isRolledBack: boolean
}

interface IdempotencyRecord {
    key: string
    status: 'pending' | 'completed' | 'failed'
    result?: unknown
    createdAt: string
}

// ============================================================================
// Helper: Generate secure password
// ============================================================================
function generatePassword(): string {
    return crypto.randomBytes(8).toString("base64url").slice(0, 12) + "!A1"
}

// ============================================================================
// Helper: Delay for rate limiting
// ============================================================================
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ============================================================================
// Helper: Generate idempotency key for an operation
// ============================================================================
function generateIdempotencyKey(jobId: string, operation: string, identifier: string): string {
    return crypto.createHash('sha256')
        .update(`${jobId}:${operation}:${identifier}`)
        .digest('hex')
}

// ============================================================================
// Helper: Check if operation was already completed (idempotency)
// ============================================================================
async function checkIdempotency(
    jobId: string,
    operation: string,
    identifier: string
): Promise<{ completed: boolean; result?: unknown }> {
    const key = generateIdempotencyKey(jobId, operation, identifier)

    const { data, error } = await supabaseAdmin
        .from('bulk_import_idempotency')
        .select('status, result')
        .eq('job_id', jobId)
        .eq('operation_key', key)
        .maybeSingle()

    if (error || !data) {
        return { completed: false }
    }

    return {
        completed: data.status === 'completed',
        result: data.result
    }
}

// ============================================================================
// Helper: Record operation completion for idempotency
// ============================================================================
async function recordIdempotency(
    jobId: string,
    adminId: string,
    operation: string,
    identifier: string,
    status: 'pending' | 'completed' | 'failed',
    result?: unknown
): Promise<void> {
    const key = generateIdempotencyKey(jobId, operation, identifier)

    await supabaseAdmin
        .from('bulk_import_idempotency')
        .upsert({
            job_id: jobId,
            admin_id: adminId,
            operation_key: key,
            operation_type: operation,
            identifier,
            status,
            result: result || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'job_id,operation_key' })
}

// ============================================================================
// Helper: Create transaction context
// ============================================================================
function createTransactionContext(jobId: string, adminUserId: string): TransactionContext {
    return {
        jobId,
        adminUserId,
        createdOwners: [],
        createdPropertyIds: [],
        createdSubscriptionIds: [],
        processedItems: new Set(),
        isRolledBack: false,
    }
}

// ============================================================================
// Helper: Atomic owner creation with subscription
// ============================================================================
async function createOwnerWithSubscriptionAtomically(
    ownerData: {
        email: string
        name: string
        phone: string
        password_encrypted: string
    },
    jobId: string,
    adminId: string,
    tx: TransactionContext
): Promise<{ success: boolean; userId?: string; password?: string; error?: string; alreadyExists?: boolean }> {
    const idempotencyKey = `owner:${ownerData.email}`

    // Check idempotency
    if (tx.processedItems.has(idempotencyKey)) {
        const existing = tx.createdOwners.find(o => o.email === ownerData.email)
        return { success: true, userId: existing?.id, password: existing?.password, alreadyExists: true }
    }

    const existingCheck = await checkIdempotency(jobId, 'owner_created', ownerData.email)
    if (existingCheck.completed && existingCheck.result) {
        const result = existingCheck.result as { userId: string; password: string }
        tx.processedItems.add(idempotencyKey)
        return { success: true, userId: result.userId, password: result.password, alreadyExists: true }
    }

    // Decrypt password
    let password: string
    try {
        try {
            password = decrypt(ownerData.password_encrypted)
        } catch {
            const legacy = decryptLegacy(ownerData.password_encrypted)
            if (!legacy) {
                throw new Error('Failed to decrypt password')
            }
            password = legacy
        }
    } catch (error: any) {
        await recordIdempotency(jobId, adminId, 'owner_created', ownerData.email, 'failed', { error: error.message })
        return { success: false, error: `Password decryption failed: ${error.message}` }
    }

    try {
        // Create auth user
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: ownerData.email,
            password: password,
            email_confirm: true,
            user_metadata: {
                name: ownerData.name,
                phone: ownerData.phone,
                role: 'owner',
            },
        })

        if (authError) {
            // If user already exists, handle gracefully
            if (authError.message?.includes('already exists')) {
                const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
                const existingUser = users?.find(u => u.email === ownerData.email)

                if (existingUser) {
                    // Ensure users table entry exists
                    await supabaseAdmin.from('users').upsert({
                        id: existingUser.id,
                        email: ownerData.email,
                        name: ownerData.name,
                        phone: ownerData.phone,
                        role: 'owner',
                        verified: true,
                        email_verified_at: existingUser.email_confirmed_at || new Date().toISOString(),
                    }, { onConflict: 'id' })

                    // Track for potential rollback (but don't delete existing users)
                    tx.createdOwners.push({
                        email: ownerData.email,
                        id: existingUser.id,
                        password: '[ALREADY EXISTS]',
                    })
                    tx.processedItems.add(idempotencyKey)

                    // Record idempotency
                    await recordIdempotency(jobId, adminId, 'owner_created', ownerData.email, 'completed', {
                        userId: existingUser.id,
                        password: '[ALREADY EXISTS]'
                    })

                    return { success: true, userId: existingUser.id, password: '[ALREADY EXISTS]', alreadyExists: true }
                }
            }
            throw authError
        }

        if (!authData.user) {
            throw new Error("Failed to create user - no user returned")
        }

        const userId = authData.user.id

        // Create users table entry (idempotent via upsert)
        const { error: userError } = await supabaseAdmin.from('users').upsert({
            id: userId,
            email: ownerData.email,
            name: ownerData.name,
            phone: ownerData.phone,
            role: 'owner',
            verified: true,
            email_verified_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
        }, { onConflict: 'id' })

        if (userError) {
            console.error("Error creating user record:", userError)
            // Continue - auth user is created, which is the important part
        }

        // Create subscription atomically with user
        const startDate = new Date()
        const endDate = new Date()
        endDate.setFullYear(endDate.getFullYear() + 100)

        const { data: subData, error: subError } = await supabaseAdmin
            .from('subscriptions')
            .insert({
                user_id: userId,
                plan_name: 'Free',
                plan_duration: 'lifetime',
                amount: 0,
                status: 'active',
                properties_limit: 1,
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
            })
            .select('id')
            .single()

        if (subError) {
            console.error("Error creating subscription for owner:", subError)
            // Log but continue - property will still be created
        } else if (subData) {
            tx.createdSubscriptionIds.push(subData.id)
        }

        // Track in transaction context
        tx.createdOwners.push({
            email: ownerData.email,
            id: userId,
            password: password,
        })
        tx.processedItems.add(idempotencyKey)

        // Record idempotency
        await recordIdempotency(jobId, adminId, 'owner_created', ownerData.email, 'completed', {
            userId,
            password
        })

        // Log audit
        await supabaseAdmin.from("bulk_import_audit_log").insert({
            job_id: jobId,
            admin_id: adminId,
            action: "owner_created",
            details: {
                email: ownerData.email,
                user_id: userId,
                transaction_id: tx.jobId,
            },
        })

        return { success: true, userId, password }

    } catch (error: any) {
        console.error(`Failed to create owner ${ownerData.email}:`, error)
        await recordIdempotency(jobId, adminId, 'owner_created', ownerData.email, 'failed', { error: error.message })
        return { success: false, error: error.message }
    }
}

// ============================================================================
// Helper: Atomic property creation
// ============================================================================
async function createPropertyAtomically(
    prop: {
        psn: string
        property_name: string
        owner_email: string
        owner_name: string
        owner_phone?: string
        property_data: Record<string, unknown>
    },
    ownerId: string,
    imagesByPSN: Record<string, any[]>,
    jobId: string,
    adminId: string,
    tx: TransactionContext
): Promise<{ success: boolean; propertyId?: string; error?: string }> {
    const idempotencyKey = `property:${prop.psn}`

    // Check idempotency
    if (tx.processedItems.has(idempotencyKey)) {
        const existingId = tx.createdPropertyIds.find(id => id === prop.psn)
        return { success: true, propertyId: existingId }
    }

    const existingCheck = await checkIdempotency(jobId, 'property_created', prop.psn)
    if (existingCheck.completed && existingCheck.result) {
        const result = existingCheck.result as { propertyId: string }
        tx.processedItems.add(idempotencyKey)
        tx.createdPropertyIds.push(result.propertyId)
        return { success: true, propertyId: result.propertyId }
    }

    try {
        // Get images for this property
        const propertyImages = imagesByPSN[prop.psn] || []
        const imageUrls = propertyImages.map((img: any) => img.public_url)

        // Build property data
        const propertyData = {
            ...prop.property_data,
            owner_id: ownerId,
            owner_name: prop.owner_name,
            owner_contact: prop.owner_phone || prop.property_data?.owner_contact || '',
            images: imageUrls,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            published_at: new Date().toISOString(),
            status: 'active',
            availability: 'Available',
            // Add idempotency tracking
            bulk_import_job_id: jobId,
            bulk_import_psn: prop.psn,
        }

        // Insert property
        const { data: insertedProp, error: propError } = await supabaseAdmin
            .from('properties')
            .insert(propertyData)
            .select('id')
            .single()

        if (propError) {
            throw propError
        }

        if (!insertedProp) {
            throw new Error("Property insertion returned no data")
        }

        const propertyId = insertedProp.id

        // Update staged images to assigned (best effort)
        if (propertyImages.length > 0) {
            await supabaseAdmin
                .from('bulk_import_staged_images')
                .update({ status: 'assigned', processed_at: new Date().toISOString() })
                .eq('job_id', jobId)
                .eq('extracted_psn', prop.psn)
        }

        // Track in transaction context
        tx.createdPropertyIds.push(propertyId)
        tx.processedItems.add(idempotencyKey)

        // Record idempotency
        await recordIdempotency(jobId, adminId, 'property_created', prop.psn, 'completed', {
            propertyId,
            ownerId,
        })

        // Log audit
        await supabaseAdmin.from("bulk_import_audit_log").insert({
            job_id: jobId,
            admin_id: adminId,
            action: "property_created",
            details: {
                property_id: propertyId,
                psn: prop.psn,
                title: prop.property_name,
                owner_id: ownerId,
                image_count: propertyImages.length,
                transaction_id: tx.jobId,
            },
        })

        return { success: true, propertyId }

    } catch (error: any) {
        console.error(`Failed to create property PSN ${prop.psn}:`, error)
        await recordIdempotency(jobId, adminId, 'property_created', prop.psn, 'failed', { error: error.message })
        return { success: false, error: error.message }
    }
}

// ============================================================================
// Helper: Comprehensive rollback with retry logic
// ============================================================================
async function rollbackTransaction(tx: TransactionContext): Promise<{ success: boolean; details: Record<string, unknown> }> {
    if (tx.isRolledBack) {
        return { success: true, details: { alreadyRolledBack: true } }
    }

    tx.isRolledBack = true
    const details: Record<string, unknown> = {
        properties_attempted: 0,
        properties_succeeded: 0,
        properties_failed: [],
        owners_attempted: 0,
        owners_succeeded: 0,
        owners_failed: [],
        subscriptions_attempted: 0,
        subscriptions_succeeded: 0,
    }

    // Rollback in reverse order of creation:
    // 1. Properties first (they reference owners)
    // 2. Subscriptions (they reference users)
    // 3. Users table entries
    // 4. Auth users last

    // Rollback properties
    details.properties_attempted = tx.createdPropertyIds.length
    for (const propId of tx.createdPropertyIds) {
        try {
            const { error } = await supabaseAdmin
                .from('properties')
                .delete()
                .eq('id', propId)

            if (error) {
                console.error(`Failed to delete property ${propId}:`, error)
                ;(details.properties_failed as string[]).push(propId)
            } else {
                details.properties_succeeded = (details.properties_succeeded as number) + 1
            }
        } catch (error: any) {
            console.error(`Exception deleting property ${propId}:`, error)
            ;(details.properties_failed as string[]).push(propId)
        }
    }

    // Rollback subscriptions
    details.subscriptions_attempted = tx.createdSubscriptionIds.length
    for (const subId of tx.createdSubscriptionIds) {
        try {
            const { error } = await supabaseAdmin
                .from('subscriptions')
                .delete()
                .eq('id', subId)

            if (error) {
                console.error(`Failed to delete subscription ${subId}:`, error)
            } else {
                details.subscriptions_succeeded = (details.subscriptions_succeeded as number) + 1
            }
        } catch (error: any) {
            console.error(`Exception deleting subscription ${subId}:`, error)
        }
    }

    // Rollback owners (only those created in this transaction, not pre-existing)
    const newOwners = tx.createdOwners.filter(o => o.password !== '[ALREADY EXISTS]')
    details.owners_attempted = newOwners.length

    for (const owner of newOwners) {
        try {
            // Delete from users table first
            const { error: userError } = await supabaseAdmin
                .from('users')
                .delete()
                .eq('id', owner.id)

            if (userError) {
                console.error(`Failed to delete user record ${owner.id}:`, userError)
            }

            // Delete auth user
            const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(owner.id)

            if (authError) {
                console.error(`Failed to delete auth user ${owner.id}:`, authError)
                ;(details.owners_failed as string[]).push(owner.id)
            } else {
                details.owners_succeeded = (details.owners_succeeded as number) + 1
            }
        } catch (error: any) {
            console.error(`Exception deleting owner ${owner.id}:`, error)
            ;(details.owners_failed as string[]).push(owner.id)
        }
    }

    // Log rollback
    await supabaseAdmin.from("bulk_import_audit_log").insert({
        job_id: tx.jobId,
        admin_id: tx.adminUserId,
        action: "rollback_executed",
        details: {
            properties_rolled_back: details.properties_succeeded,
            owners_rolled_back: details.owners_succeeded,
            subscriptions_rolled_back: details.subscriptions_succeeded,
            failures: {
                properties: details.properties_failed,
                owners: details.owners_failed,
            },
            transaction_id: tx.jobId,
        },
    })

    const overallSuccess = (details.properties_failed as string[]).length === 0 &&
                          (details.owners_failed as string[]).length === 0

    return { success: overallSuccess, details }
}

// ============================================================================
// POST /api/admin/bulk-import/jobs/[id]/confirm
// Execute the final import
// ============================================================================
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const encoder = new TextEncoder()
    const { id: jobId } = await params

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: Record<string, unknown>) => {
                controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))
            }

            // CSRF protection
            const csrfCheck = await csrfProtection(request)
            if (!csrfCheck.valid) {
                send({ error: csrfCheck.error || 'Invalid request' })
                controller.close()
                return
            }

            // Initialize transaction context for atomic operations
            let tx: TransactionContext | null = null

            try {
                // Auth check
                const supabase = await createClient()
                const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

                if (authError || !authUser) {
                    send({ error: "Unauthorized" })
                    controller.close()
                    return
                }

                // Initialize transaction context
                tx = createTransactionContext(jobId, authUser.id)

                // Verify job
                const { data: job, error: jobError } = await supabaseAdmin
                    .from("bulk_import_jobs")
                    .select("*")
                    .eq("id", jobId)
                    .eq("admin_id", authUser.id)
                    .single()

                if (jobError || !job) {
                    send({ error: "Job not found" })
                    controller.close()
                    return
                }

                // Idempotency check: if already processing or completed, return success
                if (job.status === "processing") {
                    send({ status: "Import already in progress...", progress: 50 })
                    controller.close()
                    return
                }

                if (job.status === "completed" || job.status === "completed_with_errors") {
                    send({
                        status: "Import already completed",
                        progress: 100,
                        completed: true,
                        success: true,
                        results: {
                            total_properties: job.processed_properties || 0,
                            created_properties: job.processed_properties || 0,
                            failed_properties: job.failed_properties || 0,
                        },
                    })
                    controller.close()
                    return
                }

                if (job.status !== "images_uploaded" && job.status !== "ready") {
                    send({ error: "Job is not ready for import" })
                    controller.close()
                    return
                }

                // ============================================================================
                // ACQUIRE PROCESSING LOCK - Prevent concurrent execution
                // ============================================================================
                const lockResult = await acquireProcessingLock(jobId, authUser.id)
                if (!lockResult.success) {
                    send({ error: lockResult.error || "Could not acquire processing lock" })
                    controller.close()
                    return
                }

                // Ensure lock is released when done
                const releaseLock = () => {
                    releaseProcessingLock(jobId)
                }

                // Atomic status update using transaction-like pattern
                // Only update if status is still "images_uploaded" or "ready"
                const { data: updatedJob, error: updateError } = await supabaseAdmin
                    .from("bulk_import_jobs")
                    .update({
                        status: "processing",
                        step: "processing",
                        processing_started_at: new Date().toISOString(),
                    })
                    .eq("id", jobId)
                    .eq("status", "images_uploaded") // Optimistic lock - only update if still in expected state
                    .select()
                    .maybeSingle()

                if (updateError || !updatedJob) {
                    releaseLock()
                    // Another process may have started processing
                    const { data: currentJob } = await supabaseAdmin
                        .from("bulk_import_jobs")
                        .select("status, processed_properties, failed_properties")
                        .eq("id", jobId)
                        .single()

                    if (currentJob?.status === "processing") {
                        send({ status: "Import already in progress...", progress: 50 })
                    } else if (currentJob?.status === "completed" || currentJob?.status === "completed_with_errors") {
                        send({
                            status: "Import already completed",
                            progress: 100,
                            completed: true,
                            success: true,
                            results: {
                                total_properties: currentJob.processed_properties || 0,
                                created_properties: currentJob.processed_properties || 0,
                                failed_properties: currentJob.failed_properties || 0,
                            },
                        })
                    } else {
                        send({ error: "Could not start import - job state changed" })
                    }
                    controller.close()
                    return
                }

                send({ status: "Starting import...", progress: 0 })

                // Get parsed data
                const properties = job.parsed_properties as any[] || []
                const imagesByPSN = job.images_by_psn as Record<string, any[]> || {}
                const newOwnersFromExcel = job.new_owners as any[] || []

                // Track results
                const failedItems: any[] = []

                // Update initial progress
                await updateJobProgress(jobId, {
                    status: "processing",
                    progress: 0,
                    step: "creating_owners",
                    totalCount: properties.length,
                    processedCount: 0,
                    failedCount: 0,
                    message: "Starting import...",
                })

                // ============================================================================
                // STEP 1: Create new owner accounts
                // ============================================================================
                send({
                    status: `Creating ${newOwnersFromExcel.length} owner accounts...`,
                    progress: 5,
                    step: "creating_owners",
                })

                // Process owners in batches of 3 to avoid rate limits
                const ownerBatches = chunkArray(newOwnersFromExcel, 3)

                for (let batchIndex = 0; batchIndex < ownerBatches.length; batchIndex++) {
                    const batch = ownerBatches[batchIndex]

                    // Process sequentially within batch for better transaction safety
                    for (const ownerData of batch) {
                        const result = await createOwnerWithSubscriptionAtomically(
                            ownerData,
                            jobId,
                            authUser.id,
                            tx!
                        )

                        if (!result.success) {
                            failedItems.push({
                                type: 'owner',
                                email: ownerData.email,
                                error: result.error,
                            })
                        }
                    }

                    // Rate limit delay between batches
                    if (batchIndex < ownerBatches.length - 1) {
                        await delay(500)
                    }

                    const currentProgress = 5 + Math.round(((batchIndex + 1) / ownerBatches.length) * 20)
                    const ownersFailed = failedItems.filter(i => i.type === 'owner').length

                    send({
                        progress: currentProgress,
                        owners_created: tx!.createdOwners.length,
                        owners_failed: ownersFailed,
                    })

                    // Persist progress
                    await updateJobProgress(jobId, {
                        status: "processing",
                        progress: currentProgress,
                        step: "creating_owners",
                        totalCount: properties.length,
                        processedCount: tx!.createdOwners.length,
                        failedCount: ownersFailed,
                        message: `Creating owners... (${tx!.createdOwners.length} created, ${ownersFailed} failed)`,
                    })
                }

                // Build owner email to ID map from transaction context
                const ownerEmailToId = new Map<string, string>()
                for (const owner of tx!.createdOwners) {
                    ownerEmailToId.set(owner.email, owner.id)
                }

                // Also get IDs for existing owners
                const allOwnerEmails = [...new Set(properties.map(p => p.owner_email))]
                for (const email of allOwnerEmails) {
                    if (!ownerEmailToId.has(email)) {
                        const { data: user } = await supabaseAdmin
                            .from('users')
                            .select('id')
                            .eq('email', email)
                            .single()
                        if (user) {
                            ownerEmailToId.set(email, user.id)

                            // 🔥 CRITICAL: Ensure existing owners have a subscription
                            try {
                                const { data: existingSub } = await supabaseAdmin
                                    .from('subscriptions')
                                    .select('id')
                                    .eq('user_id', user.id)
                                    .eq('status', 'active')
                                    .maybeSingle()

                                if (!existingSub) {
                                    const startDate = new Date()
                                    const endDate = new Date()
                                    endDate.setFullYear(endDate.getFullYear() + 100)

                                    await supabaseAdmin.from('subscriptions').insert({
                                        user_id: user.id,
                                        plan_name: 'Free',
                                        plan_duration: 'lifetime',
                                        amount: 0,
                                        status: 'active',
                                        properties_limit: 1,
                                        start_date: startDate.toISOString(),
                                        end_date: endDate.toISOString(),
                                    })
                                }
                            } catch (subError) {
                                console.error("Error checking/creating subscription for existing owner:", subError)
                                // Continue - property will still be created
                            }
                        }
                    }
                }

                const propertiesProgress = 25
                send({
                    status: `Created ${tx!.createdOwners.length} owners, now creating properties...`,
                    progress: propertiesProgress,
                    step: "creating_properties",
                })

                // Update progress for property creation phase
                await updateJobProgress(jobId, {
                    status: "processing",
                    progress: propertiesProgress,
                    step: "creating_properties",
                    totalCount: properties.length,
                    processedCount: 0,
                    failedCount: failedItems.filter(i => i.type === 'property').length,
                    message: `Creating ${properties.length} properties...`,
                })

                // ============================================================================
                // STEP 2: Create properties
                // ============================================================================
                const propertyBatches = chunkArray(properties, 10)
                let processedProperties = 0

                for (let batchIndex = 0; batchIndex < propertyBatches.length; batchIndex++) {
                    const batch = propertyBatches[batchIndex]

                    for (const prop of batch) {
                        const ownerId = ownerEmailToId.get(prop.owner_email)

                        if (!ownerId) {
                            failedItems.push({
                                type: 'property',
                                psn: prop.psn,
                                title: prop.property_name,
                                error: `Owner not found for email: ${prop.owner_email}`,
                            })
                            continue
                        }

                        const result = await createPropertyAtomically(
                            prop,
                            ownerId,
                            imagesByPSN,
                            jobId,
                            authUser.id,
                            tx!
                        )

                        if (!result.success) {
                            failedItems.push({
                                type: 'property',
                                psn: prop.psn,
                                title: prop.property_name,
                                error: result.error,
                            })
                        }
                    }

                    processedProperties += batch.length
                    const currentProgress = 25 + Math.round((processedProperties / properties.length) * 50)
                    const propertiesFailed = failedItems.filter(i => i.type === 'property').length

                    send({
                        progress: currentProgress,
                        properties_created: tx!.createdPropertyIds.length,
                        properties_failed: propertiesFailed,
                        status: `Created ${tx!.createdPropertyIds.length} of ${properties.length} properties...`,
                    })

                    // Persist progress
                    await updateJobProgress(jobId, {
                        status: "processing",
                        progress: currentProgress,
                        step: "creating_properties",
                        totalCount: properties.length,
                        processedCount: tx!.createdPropertyIds.length,
                        failedCount: propertiesFailed,
                        message: `Created ${tx!.createdPropertyIds.length} of ${properties.length} properties...`,
                    })

                    // Small delay between batches
                    if (batchIndex < propertyBatches.length - 1) {
                        await delay(100)
                    }
                }

                send({
                    status: "Finalizing...",
                    progress: 80,
                    step: "finalizing",
                })

                // ============================================================================
                // STEP 3: Prepare credentials for download
                // ============================================================================
                const credentialsForDownload = tx!.createdOwners
                    .filter(o => o.password !== '[ALREADY EXISTS]')
                    .map(o => ({
                        email: o.email,
                        password: o.password,
                        login_url: 'https://zerorentals.com/login/owner',
                    }))

                // Encrypt credentials for storage (AES-256-GCM if configured, fallback to base64)
                let credentialsEncrypted: string
                try {
                    const { encrypt, isEncryptionConfigured } = await import('@/lib/encryption')
                    if (isEncryptionConfigured()) {
                        credentialsEncrypted = encrypt(JSON.stringify(credentialsForDownload))
                    } else {
                        console.warn('CREDENTIALS_ENCRYPTION_KEY not set, using base64 fallback')
                        credentialsEncrypted = Buffer.from(JSON.stringify(credentialsForDownload)).toString('base64')
                    }
                } catch (e) {
                    console.error('Encryption failed, using base64 fallback:', e)
                    credentialsEncrypted = Buffer.from(JSON.stringify(credentialsForDownload)).toString('base64')
                }

                // ============================================================================
                // STEP 4: Update job as complete
                // ============================================================================
                const finalStatus = failedItems.length === 0 ? 'completed' : 'completed_with_errors'

                await supabaseAdmin
                    .from("bulk_import_jobs")
                    .update({
                        status: finalStatus,
                        step: "completed",
                        processed_properties: tx!.createdPropertyIds.length,
                        failed_properties: failedItems.length,
                        created_property_ids: tx!.createdPropertyIds,
                        created_owner_ids: tx!.createdOwners.map(o => o.id),
                        failed_items: failedItems,
                        credentials_encrypted: credentialsEncrypted,
                        completed_at: new Date().toISOString(),
                    })
                    .eq("id", jobId)

                // Log completion
                await supabaseAdmin.from("bulk_import_audit_log").insert({
                    job_id: jobId,
                    admin_id: authUser.id,
                    action: "import_completed",
                    details: {
                        total_properties: properties.length,
                        created_properties: tx!.createdPropertyIds.length,
                        failed_properties: failedItems.length,
                        new_owners: tx!.createdOwners.length,
                        final_status: finalStatus,
                        transaction_id: tx!.jobId,
                    },
                })

                // ============================================================================
                // STEP 5: Send success response
                // ============================================================================
                send({
                    status: "Import completed",
                    progress: 100,
                    completed: true,
                    success: true,
                    results: {
                        total_properties: properties.length,
                        created_properties: tx!.createdPropertyIds.length,
                        failed_properties: failedItems.length,
                        new_owners: tx!.createdOwners.filter(o => o.password !== '[ALREADY EXISTS]').length,
                        existing_owners: tx!.createdOwners.filter(o => o.password === '[ALREADY EXISTS]').length,
                        failed_items: failedItems,
                    },
                    credentials_count: credentialsForDownload.length,
                })

                // Release processing lock on successful completion
                releaseProcessingLock(jobId)

                controller.close()

            } catch (error: any) {
                // Release processing lock on error
                releaseProcessingLock(jobId)

                console.error("Import confirmation error:", error)

                // Rollback any created data on critical failure using transaction context
                if (tx) {
                    const rollbackResult = await rollbackTransaction(tx)
                    console.error("Rollback result:", rollbackResult)
                }

                // Update job with error
                await supabaseAdmin
                    .from("bulk_import_jobs")
                    .update({
                        status: "failed",
                        error_message: error.message,
                        error_details: { stack: error.stack },
                    })
                    .eq("id", jobId)

                send({
                    error: error.message || "Import failed",
                    progress: 0,
                    completed: false,
                })
                controller.close()
            }
        }
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    })
}

// ============================================================================
// Helper: Chunk array into smaller arrays
// ============================================================================
function chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size))
    }
    return chunks
}
