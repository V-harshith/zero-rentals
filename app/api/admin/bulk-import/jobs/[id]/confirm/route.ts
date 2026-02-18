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
import {
    createTransactionContext,
    trackCreatedOwner,
    trackCreatedProperty,
    trackCreatedSubscription,
    markItemProcessed,
    isItemProcessed,
    rollbackTransaction,
    rollbackBatch,
    shouldSimulateFailure,
    type TransactionContext,
    type FailureSimulationConfig,
} from "@/lib/bulk-import-transaction"

// ============================================================================
// Types for Idempotency Management
// ============================================================================
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
    tx: TransactionContext,
    batchNumber: number,
    itemNumber: number
): Promise<{ success: boolean; userId?: string; password?: string; error?: string; alreadyExists?: boolean }> {
    const idempotencyKey = `owner:${ownerData.email}`

    // Check idempotency
    if (isItemProcessed(tx, idempotencyKey)) {
        const existing = tx.createdOwners.find(o => o.email === ownerData.email)
        return { success: true, userId: existing?.id, password: existing?.password, alreadyExists: true }
    }

    const existingCheck = await checkIdempotency(jobId, 'owner_created', ownerData.email)
    if (existingCheck.completed && existingCheck.result) {
        const result = existingCheck.result as { userId: string; password: string }
        markItemProcessed(tx, idempotencyKey)
        return { success: true, userId: result.userId, password: result.password, alreadyExists: true }
    }

    // Simulate failure for testing
    if (shouldSimulateFailure(tx, 'owner', batchNumber, itemNumber)) {
        const error = new Error(`Simulated failure for owner ${ownerData.email} at batch ${batchNumber}, item ${itemNumber}`)
        await recordIdempotency(jobId, adminId, 'owner_created', ownerData.email, 'failed', { error: error.message })
        return { success: false, error: error.message }
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
                    trackCreatedOwner(tx, {
                        email: ownerData.email,
                        id: existingUser.id,
                        password: '[ALREADY EXISTS]',
                    })
                    markItemProcessed(tx, idempotencyKey)

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
            trackCreatedSubscription(tx, { id: subData.id, userId })
        }

        // Track in transaction context
        trackCreatedOwner(tx, {
            email: ownerData.email,
            id: userId,
            password: password,
        })
        markItemProcessed(tx, idempotencyKey)

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
// Helper: Move images from staging to permanent location
// ============================================================================
async function moveImagesToPermanent(
    propertyImages: any[],
    propertyId: string,
    jobId: string,
    psn: string
): Promise<{ permanentUrls: string[]; errors: string[] }> {
    const permanentUrls: string[] = []
    const errors: string[] = []

    for (let index = 0; index < propertyImages.length; index++) {
        const image = propertyImages[index]
        const stagingPath = image.storage_path as string

        if (!stagingPath) {
            console.error(`[Bulk Import] No storage_path for image in PSN ${psn}`)
            errors.push(`Missing storage_path for image ${index}`)
            // Fallback to staging URL if available
            if (image.public_url) {
                permanentUrls.push(image.public_url)
            }
            continue
        }

        // Validate staging path format
        if (!stagingPath.startsWith('staging/')) {
            // Already a permanent URL or different location, use as-is
            permanentUrls.push(image.public_url)
            continue
        }

        // Create permanent path: properties/{propertyId}/{index}.jpg
        const extension = stagingPath.split('.').pop() || 'jpg'
        const permanentPath = `properties/${propertyId}/${index}.${extension}`

        try {
            // Move the file from staging to permanent location
            const { error: moveError } = await supabaseAdmin.storage
                .from('property-images')
                .move(stagingPath, permanentPath)

            if (moveError) {
                console.error(`[Bulk Import] Failed to move image ${stagingPath} to ${permanentPath}:`, moveError)
                errors.push(`Failed to move image ${index}: ${moveError.message}`)
                // Fallback to staging URL
                permanentUrls.push(image.public_url)
                continue
            }

            // Get the new public URL for the permanent location
            const { data: publicUrlData } = supabaseAdmin.storage
                .from('property-images')
                .getPublicUrl(permanentPath)

            if (publicUrlData?.publicUrl) {
                permanentUrls.push(publicUrlData.publicUrl)
            } else {
                console.error(`[Bulk Import] Failed to get public URL for ${permanentPath}`)
                errors.push(`Failed to get public URL for image ${index}`)
                // Fallback to staging URL
                permanentUrls.push(image.public_url)
            }
        } catch (error: any) {
            console.error(`[Bulk Import] Exception moving image ${stagingPath}:`, error)
            errors.push(`Exception moving image ${index}: ${error.message}`)
            // Fallback to staging URL
            permanentUrls.push(image.public_url)
        }
    }

    return { permanentUrls, errors }
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
    tx: TransactionContext,
    batchNumber: number,
    itemNumber: number
): Promise<{ success: boolean; propertyId?: string; error?: string }> {
    const idempotencyKey = `property:${prop.psn}`

    // Check idempotency
    if (isItemProcessed(tx, idempotencyKey)) {
        const existing = tx.createdProperties.find(p => p.psn === prop.psn)
        return { success: true, propertyId: existing?.id }
    }

    const existingCheck = await checkIdempotency(jobId, 'property_created', prop.psn)
    if (existingCheck.completed && existingCheck.result) {
        const result = existingCheck.result as { propertyId: string }
        markItemProcessed(tx, idempotencyKey)
        trackCreatedProperty(tx, { id: result.propertyId, psn: prop.psn, ownerId })
        return { success: true, propertyId: result.propertyId }
    }

    // Simulate failure for testing
    if (shouldSimulateFailure(tx, 'property', batchNumber, itemNumber)) {
        const error = new Error(`Simulated failure for property ${prop.psn} at batch ${batchNumber}, item ${itemNumber}`)
        await recordIdempotency(jobId, adminId, 'property_created', prop.psn, 'failed', { error: error.message })
        return { success: false, error: error.message }
    }

    try {
        // Get images for this property
        // CRITICAL: Normalize PSN to string for lookup (Excel may parse as number)
        // BUG FIX: Ensure consistent normalization with trim() to match images/route.ts
        const psnKey = String(prop.psn).trim()

        let propertyImages = imagesByPSN[psnKey] || []

        // BUG FIX: Fallback to direct database query if images not found in job record
        if (propertyImages.length === 0) {
            const { data: stagedImages, error: stagedError } = await supabaseAdmin
                .from('bulk_import_staged_images')
                .select('*')
                .eq('job_id', jobId)
                .eq('extracted_psn', psnKey)
                .eq('status', 'uploaded')

            if (!stagedError && stagedImages && stagedImages.length > 0) {
                propertyImages = stagedImages.map(img => ({
                    filename: img.filename,
                    storage_path: img.storage_path,
                    public_url: supabaseAdmin.storage.from('property-images').getPublicUrl(img.storage_path).data.publicUrl,
                }))
            } else if (stagedError) {
                console.error(`[Bulk Import] Error querying staged images:`, stagedError)
            }
        }

        // BUG FIX: Log warning if property will be created without images
        if (propertyImages.length === 0) {
            console.error(`[Bulk Import] WARNING: Property PSN "${psnKey}" will be created with EMPTY images array!`)
        }

        // Build property data WITHOUT images first (to get property ID)
        const propertyData = {
            ...prop.property_data,
            owner_id: ownerId,
            owner_name: prop.owner_name,
            owner_contact: prop.owner_phone || prop.property_data?.owner_contact || '',
            images: [], // Will be updated after image move
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            published_at: new Date().toISOString(),
            status: 'active',
            availability: 'Available',
            // Add idempotency tracking
            bulk_import_job_id: jobId,
            bulk_import_psn: prop.psn,
        }

        // Insert property without images first
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

        // Move images to permanent location and get permanent URLs
        let permanentImageUrls: string[] = []
        let imageMoveErrors: string[] = []

        if (propertyImages.length > 0) {
            const moveResult = await moveImagesToPermanent(propertyImages, propertyId, jobId, psnKey)
            permanentImageUrls = moveResult.permanentUrls
            imageMoveErrors = moveResult.errors

            if (imageMoveErrors.length > 0) {
                console.warn(`[Bulk Import] Some images failed to move for property ${propertyId}:`, imageMoveErrors)
            }

            // Update property with permanent image URLs
            if (permanentImageUrls.length > 0) {
                const { error: updateError } = await supabaseAdmin
                    .from('properties')
                    .update({ images: permanentImageUrls })
                    .eq('id', propertyId)

                if (updateError) {
                    console.error(`[Bulk Import] Failed to update property ${propertyId} with permanent URLs:`, updateError)
                    // Non-fatal: property exists but images may be staging URLs
                }
            }

            // Update staged images to assigned with property_id reference
            const { error: stagedUpdateError } = await supabaseAdmin
                .from('bulk_import_staged_images')
                .update({
                    status: 'assigned',
                    property_id: propertyId,
                    processed_at: new Date().toISOString()
                })
                .eq('job_id', jobId)
                .eq('extracted_psn', psnKey)

            if (stagedUpdateError) {
                console.error(`[Bulk Import] Failed to update staged images status for PSN ${psnKey}:`, stagedUpdateError)
                // Non-fatal error
            }
        }

        // Track in transaction context
        trackCreatedProperty(tx, { id: propertyId, psn: prop.psn, ownerId })
        markItemProcessed(tx, idempotencyKey)

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
                permanent_image_count: permanentImageUrls.length,
                image_move_errors: imageMoveErrors.length > 0 ? imageMoveErrors : undefined,
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
// POST /api/admin/bulk-import/jobs/[id]/confirm
// Execute the final import with transaction rollback support
// ============================================================================
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const encoder = new TextEncoder()
    const { id: jobId } = await params

    // Parse failure simulation header for testing
    let failureSimulation: FailureSimulationConfig | undefined
    const simHeader = request.headers.get('x-failure-simulation')
    if (simHeader && process.env.NODE_ENV !== 'production') {
        try {
            failureSimulation = JSON.parse(simHeader)
        } catch (e) {
            console.error('[Bulk Import] Invalid failure simulation header:', e)
        }
    }

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

                // Initialize transaction context with optional failure simulation
                tx = createTransactionContext(jobId, authUser.id, failureSimulation)

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
                const rawImagesByPSN = (job.images_by_psn as Record<string, any[]>) || {}

                // ============================================================================
                // EARLY VALIDATION: Verify images_by_psn exists and has data
                // ============================================================================
                let imagesByPSN: Record<string, any[]> = {}

                // First, try to use images_by_psn from job data
                if (rawImagesByPSN && Object.keys(rawImagesByPSN).length > 0) {
                    // Normalize all keys to strings
                    for (const [key, value] of Object.entries(rawImagesByPSN)) {
                        imagesByPSN[String(key).trim()] = value
                    }
                } else {
                    console.error('[Bulk Import] No images found in job.images_by_psn, attempting recovery from staged images...')

                    // Try to recover by querying staged images table
                    const { data: stagedImages, error: stagedError } = await supabaseAdmin
                        .from("bulk_import_staged_images")
                        .select("*")
                        .eq("job_id", jobId)
                        .eq("status", "uploaded")

                    if (stagedError) {
                        console.error('[Bulk Import] Failed to query staged images:', stagedError)
                    } else if (stagedImages && stagedImages.length > 0) {
                        // Rebuild imagesByPSN from staged images
                        for (const img of stagedImages) {
                            const psnKey = String(img.extracted_psn).trim()
                            if (!imagesByPSN[psnKey]) imagesByPSN[psnKey] = []

                            // Get public URL for the image
                            const { data: publicUrl } = supabaseAdmin
                                .storage
                                .from("property-images")
                                .getPublicUrl(img.storage_path)

                            imagesByPSN[psnKey].push({
                                filename: img.filename,
                                storage_path: img.storage_path,
                                public_url: publicUrl.publicUrl,
                            })
                        }
                    } else {
                        console.error('[Bulk Import] No staged images found for recovery')
                    }
                }

                // Log warning if still no images
                if (Object.keys(imagesByPSN).length === 0) {
                    console.error('[Bulk Import] WARNING: No images available for any property! Properties will be created without images.')
                }

                const newOwnersFromExcel = job.new_owners as any[] || []

                // Track results
                const failedItems: any[] = []
                let criticalFailure = false

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
                // STEP 1: Create new owner accounts with per-batch rollback
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
                    const batchOwnersCreated: string[] = []
                    const batchSubscriptionsCreated: string[] = []
                    let batchFailed = false

                    // Process sequentially within batch for better transaction safety
                    for (let itemIndex = 0; itemIndex < batch.length; itemIndex++) {
                        const ownerData = batch[itemIndex]
                        const result = await createOwnerWithSubscriptionAtomically(
                            ownerData,
                            jobId,
                            authUser.id,
                            tx!,
                            batchIndex,
                            itemIndex
                        )

                        if (result.success && result.userId) {
                            batchOwnersCreated.push(result.userId)
                        } else if (!result.success) {
                            failedItems.push({
                                type: 'owner',
                                email: ownerData.email,
                                error: result.error,
                            })
                            // Check if this is a critical failure requiring rollback
                            if (result.error?.includes('Simulated failure')) {
                                batchFailed = true
                                criticalFailure = true
                                break
                            }
                        }
                    }

                    // If batch had critical failure, rollback this batch
                    if (batchFailed) {
                        console.error(`[Bulk Import] Critical failure in owner batch ${batchIndex}, rolling back batch...`)
                        const rollbackResult = await rollbackBatch(
                            tx!,
                            [], // No properties yet
                            batchSubscriptionsCreated,
                            batchOwnersCreated
                        )

                        send({
                            status: `Critical error in owner batch ${batchIndex + 1}, rolling back...`,
                            progress: 10,
                            rollback_performed: true,
                            rollback_result: rollbackResult.success,
                        })

                        // Continue with remaining batches or stop based on error severity
                        // For now, we continue but mark the failure
                    }

                    // Rate limit delay between batches
                    if (batchIndex < ownerBatches.length - 1 && !criticalFailure) {
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

                    // Stop processing if critical failure
                    if (criticalFailure) {
                        throw new Error(`Critical failure in owner creation batch ${batchIndex + 1}. Import aborted.`)
                    }
                }

                // Build owner email to ID map from transaction context
                const ownerEmailToId = new Map<string, string>()
                for (const owner of tx!.createdOwners) {
                    ownerEmailToId.set(owner.email, owner.id)
                }

                // Also get IDs for existing owners and track their subscriptions
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

                            // CRITICAL: Ensure existing owners have a subscription
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

                                    const { data: newSub } = await supabaseAdmin.from('subscriptions').insert({
                                        user_id: user.id,
                                        plan_name: 'Free',
                                        plan_duration: 'lifetime',
                                        amount: 0,
                                        status: 'active',
                                        properties_limit: 1,
                                        start_date: startDate.toISOString(),
                                        end_date: endDate.toISOString(),
                                    }).select('id').single()

                                    if (newSub) {
                                        trackCreatedSubscription(tx!, { id: newSub.id, userId: user.id })
                                    }
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
                // STEP 2: Create properties with per-batch rollback
                // ============================================================================
                const propertyBatches = chunkArray(properties, 10)
                let processedProperties = 0

                for (let batchIndex = 0; batchIndex < propertyBatches.length; batchIndex++) {
                    const batch = propertyBatches[batchIndex]
                    const batchPropertiesCreated: string[] = []
                    let batchFailed = false

                    for (let itemIndex = 0; itemIndex < batch.length; itemIndex++) {
                        const prop = batch[itemIndex]
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
                            tx!,
                            batchIndex,
                            itemIndex
                        )

                        if (result.success && result.propertyId) {
                            batchPropertiesCreated.push(result.propertyId)
                        } else if (!result.success) {
                            failedItems.push({
                                type: 'property',
                                psn: prop.psn,
                                title: prop.property_name,
                                error: result.error,
                            })
                            // Check if this is a critical failure requiring rollback
                            if (result.error?.includes('Simulated failure')) {
                                batchFailed = true
                                criticalFailure = true
                                break
                            }
                        }
                    }

                    // If batch had critical failure, rollback this batch
                    if (batchFailed) {
                        console.error(`[Bulk Import] Critical failure in property batch ${batchIndex}, rolling back batch...`)
                        const rollbackResult = await rollbackBatch(
                            tx!,
                            batchPropertiesCreated,
                            [],
                            []
                        )

                        send({
                            status: `Critical error in property batch ${batchIndex + 1}, rolling back...`,
                            progress: 25 + Math.round((processedProperties / properties.length) * 50),
                            rollback_performed: true,
                            rollback_result: rollbackResult.success,
                        })
                    }

                    processedProperties += batch.length
                    const currentProgress = 25 + Math.round((processedProperties / properties.length) * 50)
                    const propertiesFailed = failedItems.filter(i => i.type === 'property').length

                    send({
                        progress: currentProgress,
                        properties_created: tx!.createdProperties.length,
                        properties_failed: propertiesFailed,
                        status: `Created ${tx!.createdProperties.length} of ${properties.length} properties...`,
                    })

                    // Persist progress
                    await updateJobProgress(jobId, {
                        status: "processing",
                        progress: currentProgress,
                        step: "creating_properties",
                        totalCount: properties.length,
                        processedCount: tx!.createdProperties.length,
                        failedCount: propertiesFailed,
                        message: `Created ${tx!.createdProperties.length} of ${properties.length} properties...`,
                    })

                    // Stop processing if critical failure
                    if (criticalFailure) {
                        throw new Error(`Critical failure in property creation batch ${batchIndex + 1}. Import aborted.`)
                    }

                    // Small delay between batches
                    if (batchIndex < propertyBatches.length - 1) {
                        await delay(100)
                    }
                }

                // ============================================================================
                // FINAL VERIFICATION: Count properties with/without images
                // ============================================================================
                const propertiesWithImages = tx!.createdProperties.filter(r => {
                    const psnKey = String(r.psn).trim()
                    const imgs = imagesByPSN[psnKey] || []
                    return imgs.length > 0
                }).length
                const propertiesWithoutImages = tx!.createdProperties.length - propertiesWithImages

                send({
                    status: "Finalizing...",
                    progress: 80,
                    step: "finalizing",
                    properties_with_images: propertiesWithImages,
                    properties_without_images: propertiesWithoutImages,
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
                        processed_properties: tx!.createdProperties.length,
                        failed_properties: failedItems.length,
                        created_property_ids: tx!.createdProperties.map(p => p.id),
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
                        created_properties: tx!.createdProperties.length,
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
                        created_properties: tx!.createdProperties.length,
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

                    // Send rollback information to client
                    send({
                        error: error.message || "Import failed",
                        progress: 0,
                        completed: false,
                        rollback_performed: true,
                        rollback_success: rollbackResult.success,
                        rollback_details: rollbackResult.details,
                        rollback_errors: rollbackResult.errors,
                    })
                } else {
                    send({
                        error: error.message || "Import failed",
                        progress: 0,
                        completed: false,
                    })
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
