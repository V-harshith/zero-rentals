import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import crypto from "crypto"
import { decrypt, decryptLegacy } from "@/lib/encryption"
import {
    acquireProcessingLock,
    releaseProcessingLock,
    updateJobProgress,
} from "@/lib/bulk-import-queue"

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

            // Track results (moved outside try for catch block access)
            const createdOwners: { email: string; id: string; password: string }[] = []
            const createdPropertyIds: string[] = []
            let adminUserId: string | null = null

            // ============================================================================
            // Helper: Rollback created data on critical failure
            // ============================================================================
            const rollbackCreatedData = async (adminId: string) => {
                try {
                    // Delete created properties
                    for (const propId of createdPropertyIds) {
                        await supabaseAdmin
                            .from('properties')
                            .delete()
                            .eq('id', propId)
                    }

                    // Delete created owners (auth users)
                    for (const owner of createdOwners) {
                        if (owner.password !== '[ALREADY EXISTS]') {
                            await supabaseAdmin.auth.admin.deleteUser(owner.id)
                            await supabaseAdmin
                                .from('users')
                                .delete()
                                .eq('id', owner.id)
                        }
                    }

                    // Log rollback
                    await supabaseAdmin.from("bulk_import_audit_log").insert({
                        job_id: jobId,
                        admin_id: adminId,
                        action: "rollback_executed",
                        details: {
                            properties_rolled_back: createdPropertyIds.length,
                            owners_rolled_back: createdOwners.filter(o => o.password !== '[ALREADY EXISTS]').length,
                        },
                    })
                } catch (rollbackError) {
                    console.error("Rollback failed:", rollbackError)
                    // Log rollback failure
                    await supabaseAdmin.from("bulk_import_audit_log").insert({
                        job_id: jobId,
                        admin_id: adminId,
                        action: "rollback_failed",
                        details: { error: (rollbackError as Error).message },
                    })
                }
            }

            try {
                // Auth check
                const supabase = await createClient()
                const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

                if (authError || !authUser) {
                    send({ error: "Unauthorized" })
                    controller.close()
                    return
                }

                // Store for catch block access
                adminUserId = authUser.id

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

                    await Promise.all(batch.map(async (ownerData) => {
                        try {
                            // Decrypt password (supports both AES and legacy base64)
                            let password: string
                            try {
                                password = decrypt(ownerData.password_encrypted)
                            } catch {
                                // Try legacy base64 decryption
                                const legacy = decryptLegacy(ownerData.password_encrypted)
                                if (!legacy) {
                                    throw new Error('Failed to decrypt password')
                                }
                                password = legacy
                            }

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
                                // If user already exists, try to get their ID
                                if (authError.message?.includes('already exists')) {
                                    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
                                    const existingUser = users?.find(u => u.email === ownerData.email)

                                    if (existingUser) {
                                        // Ensure users table entry
                                        await supabaseAdmin.from('users').upsert({
                                            id: existingUser.id,
                                            email: ownerData.email,
                                            name: ownerData.name,
                                            phone: ownerData.phone,
                                            role: 'owner',
                                            verified: true,
                                            email_verified_at: existingUser.email_confirmed_at || new Date().toISOString(),
                                        }, { onConflict: 'id' })

                                        createdOwners.push({
                                            email: ownerData.email,
                                            id: existingUser.id,
                                            password: '[ALREADY EXISTS]',
                                        })

                                        return
                                    }
                                }
                                throw authError
                            }

                            if (!authData.user) {
                                throw new Error("Failed to create user - no user returned")
                            }

                            // Create users table entry
                            const { error: userError } = await supabaseAdmin.from('users').insert({
                                id: authData.user.id,
                                email: ownerData.email,
                                name: ownerData.name,
                                phone: ownerData.phone,
                                role: 'owner',
                                verified: true,
                                email_verified_at: new Date().toISOString(),
                                created_at: new Date().toISOString(),
                            })

                            if (userError) {
                                console.error("Error creating user record:", userError)
                                // Continue - auth user is created, which is the important part
                            }

                            // 🔥 CRITICAL: Create free subscription so properties appear on homepage
                            try {
                                const startDate = new Date()
                                const endDate = new Date()
                                endDate.setFullYear(endDate.getFullYear() + 100) // 100 years = effectively permanent

                                await supabaseAdmin.from('subscriptions').insert({
                                    user_id: authData.user.id,
                                    plan_name: 'Free',
                                    plan_duration: 'lifetime',
                                    amount: 0,
                                    status: 'active',
                                    properties_limit: 1,
                                    start_date: startDate.toISOString(),
                                    end_date: endDate.toISOString(),
                                })
                            } catch (subError) {
                                console.error("Error creating subscription for owner:", subError)
                                // Log but continue - property will still be created
                            }

                            createdOwners.push({
                                email: ownerData.email,
                                id: authData.user.id,
                                password: password,
                            })

                            // Log audit
                            await supabaseAdmin.from("bulk_import_audit_log").insert({
                                job_id: jobId,
                                admin_id: authUser.id,
                                action: "owner_created",
                                details: {
                                    email: ownerData.email,
                                    user_id: authData.user.id,
                                },
                            })

                        } catch (error: any) {
                            console.error(`Failed to create owner ${ownerData.email}:`, error)
                            failedItems.push({
                                type: 'owner',
                                email: ownerData.email,
                                error: error.message,
                            })
                        }
                    }))

                    // Rate limit delay between batches
                    if (batchIndex < ownerBatches.length - 1) {
                        await delay(500)
                    }

                    const currentProgress = 5 + Math.round(((batchIndex + 1) / ownerBatches.length) * 20)
                    const ownersFailed = failedItems.filter(i => i.type === 'owner').length

                    send({
                        progress: currentProgress,
                        owners_created: createdOwners.length,
                        owners_failed: ownersFailed,
                    })

                    // Persist progress
                    await updateJobProgress(jobId, {
                        status: "processing",
                        progress: currentProgress,
                        step: "creating_owners",
                        totalCount: properties.length,
                        processedCount: createdOwners.length,
                        failedCount: ownersFailed,
                        message: `Creating owners... (${createdOwners.length} created, ${ownersFailed} failed)`,
                    })
                }

                // Build owner email to ID map
                const ownerEmailToId = new Map<string, string>()
                for (const owner of createdOwners) {
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
                    status: `Created ${createdOwners.length} owners, now creating properties...`,
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
                        try {
                            const ownerId = ownerEmailToId.get(prop.owner_email)

                            if (!ownerId) {
                                throw new Error(`Owner not found for email: ${prop.owner_email}`)
                            }

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

                            createdPropertyIds.push(insertedProp.id)

                            // Update staged images to assigned
                            if (propertyImages.length > 0) {
                                await supabaseAdmin
                                    .from('bulk_import_staged_images')
                                    .update({ status: 'assigned', processed_at: new Date().toISOString() })
                                    .eq('job_id', jobId)
                                    .eq('extracted_psn', prop.psn)
                            }

                            // Log audit
                            await supabaseAdmin.from("bulk_import_audit_log").insert({
                                job_id: jobId,
                                admin_id: authUser.id,
                                action: "property_created",
                                details: {
                                    property_id: insertedProp.id,
                                    psn: prop.psn,
                                    title: prop.property_name,
                                    owner_id: ownerId,
                                    image_count: propertyImages.length,
                                },
                            })

                        } catch (error: any) {
                            console.error(`Failed to create property PSN ${prop.psn}:`, error)
                            failedItems.push({
                                type: 'property',
                                psn: prop.psn,
                                title: prop.property_name,
                                error: error.message,
                            })
                        }
                    }

                    processedProperties += batch.length
                    const currentProgress = 25 + Math.round((processedProperties / properties.length) * 50)
                    const propertiesFailed = failedItems.filter(i => i.type === 'property').length

                    send({
                        progress: currentProgress,
                        properties_created: createdPropertyIds.length,
                        properties_failed: propertiesFailed,
                        status: `Created ${createdPropertyIds.length} of ${properties.length} properties...`,
                    })

                    // Persist progress
                    await updateJobProgress(jobId, {
                        status: "processing",
                        progress: currentProgress,
                        step: "creating_properties",
                        totalCount: properties.length,
                        processedCount: createdPropertyIds.length,
                        failedCount: propertiesFailed,
                        message: `Created ${createdPropertyIds.length} of ${properties.length} properties...`,
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
                const credentialsForDownload = createdOwners
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
                        processed_properties: createdPropertyIds.length,
                        failed_properties: failedItems.length,
                        created_property_ids: createdPropertyIds,
                        created_owner_ids: createdOwners.map(o => o.id),
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
                        created_properties: createdPropertyIds.length,
                        failed_properties: failedItems.length,
                        new_owners: createdOwners.length,
                        final_status: finalStatus,
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
                        created_properties: createdPropertyIds.length,
                        failed_properties: failedItems.length,
                        new_owners: createdOwners.filter(o => o.password !== '[ALREADY EXISTS]').length,
                        existing_owners: createdOwners.filter(o => o.password === '[ALREADY EXISTS]').length,
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

                // Rollback any created data on critical failure
                if (adminUserId) {
                    await rollbackCreatedData(adminUserId)
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
