import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { csrfProtection } from "@/lib/csrf-server"
import {
    acquireProcessingLock,
    releaseProcessingLock,
    updateJobProgress,
} from "@/lib/bulk-import-queue"
import {
    createTransactionContext,
    rollbackTransaction,
    rollbackBatch,
    type TransactionContext,
    type FailureSimulationConfig,
} from "@/lib/bulk-import-transaction"
import { logger } from "@/lib/bulk-import/logger"
import { createOwnerWithSubscriptionAtomically, ensureOwnerSubscription } from "@/lib/bulk-import/owner-service"
import { createPropertyAtomically } from "@/lib/bulk-import/property-service"
import type { PropertyData, StagedImage } from "@/lib/bulk-import/property-service"

// ============================================================================
// Helper: Delay for rate limiting
// ============================================================================
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

// ============================================================================
// Helper: Build owner email to ID map
// ============================================================================
async function buildOwnerEmailToIdMap(
    properties: PropertyData[],
    tx: TransactionContext,
    jobId: string
): Promise<Map<string, string>> {
    const ownerEmailToId = new Map<string, string>()

    // Add newly created owners
    for (const owner of tx.createdOwners) {
        ownerEmailToId.set(owner.email, owner.id)
    }

    // Get IDs for existing owners and ensure they have subscriptions - batch query
    const allOwnerEmails = [...new Set(properties.map((p) => p.owner_email))]
    const emailsToFetch = allOwnerEmails.filter((email) => !ownerEmailToId.has(email))

    if (emailsToFetch.length > 0) {
        const { data: users } = await supabaseAdmin
            .from("users")
            .select("id, email")
            .in("email", emailsToFetch)

        if (users) {
            for (const user of users) {
                ownerEmailToId.set(user.email, user.id)
                await ensureOwnerSubscription(user.id, tx)
            }
        }
    }

    return ownerEmailToId
}

// ============================================================================
// Helper: Process owner batches
// ============================================================================
async function processOwnerBatches(
    newOwnersFromExcel: Array<{
        email: string
        name: string
        phone: string
        password_encrypted: string
    }>,
    jobId: string,
    adminId: string,
    tx: TransactionContext,
    send: (data: Record<string, unknown>) => void,
    failedItems: Array<{
        type: string
        email?: string
        psn?: string
        title?: string
        error?: string
        severity?: string
        suggestion?: string
    }>
): Promise<void> {
    const ownerBatches = chunkArray(newOwnersFromExcel, 3)
    let criticalFailure = false
    let ownersFailedCount = 0

    for (let batchIndex = 0; batchIndex < ownerBatches.length; batchIndex++) {
        const batch = ownerBatches[batchIndex]
        const batchOwnersCreated: string[] = []
        let batchFailed = false

        for (let itemIndex = 0; itemIndex < batch.length; itemIndex++) {
            const ownerData = batch[itemIndex]
            const result = await createOwnerWithSubscriptionAtomically(
                ownerData,
                jobId,
                adminId,
                tx,
                batchIndex,
                itemIndex
            )

            if (result.success && result.userId) {
                batchOwnersCreated.push(result.userId)
            } else if (!result.success) {
                failedItems.push({
                    type: "owner",
                    email: ownerData.email,
                    error: result.error,
                    suggestion: result.error?.includes("decrypt")
                        ? "Password encryption issue. Contact support."
                        : "Check the email format and ensure it is not already registered.",
                })
                ownersFailedCount++
                if (result.error?.includes("Simulated failure")) {
                    batchFailed = true
                    criticalFailure = true
                    break
                }
            }
        }

        if (batchFailed) {
            logger.error("Critical failure in owner batch, rolling back", { batchIndex, jobId })
            await rollbackBatch(tx, [], [], batchOwnersCreated)
            send({
                status: `Critical error in owner batch ${batchIndex + 1}, rolling back...`,
                progress: 10,
                rollback_performed: true,
            })
        }

        if (batchIndex < ownerBatches.length - 1 && !criticalFailure) {
            await delay(500)
        }

        const currentProgress = 5 + Math.round(((batchIndex + 1) / ownerBatches.length) * 20)

        send({
            progress: currentProgress,
            owners_created: tx.createdOwners.length,
            owners_failed: ownersFailedCount,
        })

        await updateJobProgress(jobId, {
            status: "processing",
            progress: currentProgress,
            step: "creating_owners",
            totalCount: newOwnersFromExcel.length,
            processedCount: tx.createdOwners.length,
            failedCount: ownersFailedCount,
            message: `Creating owners... (${tx.createdOwners.length} created, ${ownersFailedCount} failed)`,
        })

        if (criticalFailure) {
            throw new Error(`Critical failure in owner creation batch ${batchIndex + 1}. Import aborted.`)
        }
    }
}

// ============================================================================
// Helper: Process property batches
// ============================================================================
async function processPropertyBatches(
    properties: PropertyData[],
    ownerEmailToId: Map<string, string>,
    imagesByPSN: Record<string, StagedImage[]>,
    jobId: string,
    adminId: string,
    tx: TransactionContext,
    send: (data: Record<string, unknown>) => void,
    failedItems: Array<{
        type: string
        email?: string
        psn?: string
        title?: string
        error?: string
        severity?: string
        suggestion?: string
    }>
): Promise<void> {
    const propertyBatches = chunkArray(properties, 10)
    let processedProperties = 0
    let criticalFailure = false
    let propertiesFailedCount = 0

    for (let batchIndex = 0; batchIndex < propertyBatches.length; batchIndex++) {
        const batch = propertyBatches[batchIndex]
        const batchPropertiesCreated: string[] = []
        let batchFailed = false

        for (let itemIndex = 0; itemIndex < batch.length; itemIndex++) {
            const prop = batch[itemIndex]
            const ownerId = ownerEmailToId.get(prop.owner_email)

            if (!ownerId) {
                failedItems.push({
                    type: "property",
                    psn: prop.psn,
                    title: prop.property_name,
                    error: `Owner not found for email: ${prop.owner_email}`,
                    suggestion: "Verify the owner email in the Excel file and retry the import.",
                })
                propertiesFailedCount++
                continue
            }

            const result = await createPropertyAtomically(
                prop,
                ownerId,
                imagesByPSN,
                jobId,
                adminId,
                tx,
                batchIndex,
                itemIndex
            )

            if (result.success && result.propertyId) {
                batchPropertiesCreated.push(result.propertyId)
                if (result.imageMoveErrors && result.imageMoveErrors.length > 0) {
                    failedItems.push({
                        type: "image_warning",
                        psn: prop.psn,
                        title: prop.property_name,
                        error: `Image upload issues: ${result.imageMoveErrors.join(", ")}`,
                        severity: "warning",
                    })
                }
            } else if (!result.success) {
                failedItems.push({
                    type: "property",
                    psn: prop.psn,
                    title: prop.property_name,
                    error: result.error,
                })
                propertiesFailedCount++
                if (result.error?.includes("Simulated failure")) {
                    batchFailed = true
                    criticalFailure = true
                    break
                }
            }
        }

        if (batchFailed) {
            logger.error("Critical failure in property batch, rolling back", { batchIndex, jobId })
            await rollbackBatch(tx, batchPropertiesCreated, [], [])
            send({
                status: `Critical error in property batch ${batchIndex + 1}, rolling back...`,
                progress: 25 + Math.round((processedProperties / properties.length) * 50),
                rollback_performed: true,
            })
        }

        processedProperties += batch.length
        const actualProcessed = tx.createdProperties.length + propertiesFailedCount
        const currentProgress = 25 + Math.round((actualProcessed / properties.length) * 70)

        send({
            progress: Math.min(currentProgress, 95),
            properties_created: tx.createdProperties.length,
            properties_failed: propertiesFailedCount,
            status: `Created ${tx.createdProperties.length} of ${properties.length} properties...`,
        })

        await updateJobProgress(jobId, {
            status: "processing",
            progress: Math.min(currentProgress, 95),
            step: "creating_properties",
            totalCount: properties.length,
            processedCount: tx.createdProperties.length,
            failedCount: propertiesFailedCount,
            message: `Created ${tx.createdProperties.length} of ${properties.length} properties (${propertiesFailedCount} failed)`,
        })

        if (criticalFailure) {
            throw new Error(`Critical failure in property creation batch ${batchIndex + 1}. Import aborted.`)
        }

        if (batchIndex < propertyBatches.length - 1) {
            await delay(100)
        }
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
    const simHeader = request.headers.get("x-failure-simulation")
    if (simHeader && process.env.NODE_ENV !== "production") {
        try {
            failureSimulation = JSON.parse(simHeader)
        } catch (e: unknown) {
            logger.error("Invalid failure simulation header", {
                error: e instanceof Error ? e.message : String(e),
            })
        }
    }

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: Record<string, unknown>) => {
                controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"))
            }

            // CSRF protection
            const csrfCheck = await csrfProtection(request)
            if (!csrfCheck.valid) {
                send({ error: csrfCheck.error || "Invalid request" })
                controller.close()
                return
            }

            let tx: TransactionContext | null = null
            const failedItems: Array<{
                type: string
                email?: string
                psn?: string
                title?: string
                error?: string
                severity?: string
                suggestion?: string
            }> = []

            try {
                // Auth check
                const supabase = await createClient()
                const {
                    data: { user: authUser },
                    error: authError,
                } = await supabase.auth.getUser()

                if (authError || !authUser) {
                    send({ error: "Unauthorized" })
                    controller.close()
                    return
                }

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

                // Idempotency check
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

                // Allow import if job has parsed properties (excel uploaded)
                // Status could be: excel_parsed, images_uploaded, ready, etc.
                const canImport = job.status === "excel_parsed" ||
                                  job.status === "images_uploaded" ||
                                  job.status === "ready" ||
                                  job.status === "preview_ready"

                if (!canImport) {
                    send({ error: `Job status "${job.status}" is not ready for import. Please upload Excel and images first.` })
                    controller.close()
                    return
                }

                // Acquire processing lock
                const lockResult = await acquireProcessingLock(jobId, authUser.id)
                if (!lockResult.success) {
                    send({ error: lockResult.error || "Could not acquire processing lock" })
                    controller.close()
                    return
                }

                // Atomic status update - use current job status to prevent concurrent updates
                const { data: updatedJob, error: updateError } = await supabaseAdmin
                    .from("bulk_import_jobs")
                    .update({
                        status: "processing",
                        step: "processing",
                        processing_started_at: new Date().toISOString(),
                    })
                    .eq("id", jobId)
                    .eq("status", job.status) // Use the job's current status we already verified
                    .select()
                    .maybeSingle()

                if (updateError || !updatedJob) {
                    releaseProcessingLock(jobId)
                    const { data: currentJob } = await supabaseAdmin
                        .from("bulk_import_jobs")
                        .select("status, processed_properties, failed_properties")
                        .eq("id", jobId)
                        .single()

                    if (currentJob?.status === "processing") {
                        send({ status: "Import already in progress...", progress: 50 })
                    } else if (
                        currentJob?.status === "completed" ||
                        currentJob?.status === "completed_with_errors"
                    ) {
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
                const properties = (job.parsed_properties as PropertyData[]) || []
                const rawImagesByPSN = (job.images_by_psn as Record<string, StagedImage[]>) || {}
                const newOwnersFromExcel =
                    (job.new_owners as Array<{
                        email: string
                        name: string
                        phone: string
                        password_encrypted: string
                    }>) || []

                // Normalize images_by_psn keys
                const imagesByPSN: Record<string, StagedImage[]> = {}
                if (rawImagesByPSN && Object.keys(rawImagesByPSN).length > 0) {
                    for (const [key, value] of Object.entries(rawImagesByPSN)) {
                        imagesByPSN[String(key).trim()] = value
                    }
                }

                if (Object.keys(imagesByPSN).length === 0) {
                    logger.warn("No images available for any property", { jobId })
                }

                // Step 1: Create owners
                await processOwnerBatches(
                    newOwnersFromExcel,
                    jobId,
                    authUser.id,
                    tx,
                    send,
                    failedItems
                )

                // Build owner email to ID map
                const ownerEmailToId = await buildOwnerEmailToIdMap(properties, tx, jobId)

                send({
                    status: `Created ${tx.createdOwners.length} owners, now creating properties...`,
                    progress: 25,
                    step: "creating_properties",
                })

                // Step 2: Create properties
                await processPropertyBatches(
                    properties,
                    ownerEmailToId,
                    imagesByPSN,
                    jobId,
                    authUser.id,
                    tx,
                    send,
                    failedItems
                )

                // Final verification
                const propertiesWithImages = tx.createdProperties.filter((r) => {
                    const psnKey = String(r.psn).trim()
                    const imgs = imagesByPSN[psnKey] || []
                    return imgs.length > 0
                }).length

                send({
                    status: "Finalizing...",
                    progress: 80,
                    step: "finalizing",
                    properties_with_images: propertiesWithImages,
                    properties_without_images: tx.createdProperties.length - propertiesWithImages,
                })

                // Prepare credentials
                const credentialsForDownload = tx.createdOwners
                    .filter((o) => o.password !== "[ALREADY EXISTS]")
                    .map((o) => ({
                        email: o.email,
                        password: o.password,
                        login_url: "https://zerorentals.com/login/owner",
                    }))

                // Encrypt credentials
                let credentialsEncrypted: string
                try {
                    const { encrypt, isEncryptionConfigured } = await import("@/lib/encryption")
                    if (isEncryptionConfigured()) {
                        credentialsEncrypted = encrypt(JSON.stringify(credentialsForDownload))
                    } else {
                        logger.warn("CREDENTIALS_ENCRYPTION_KEY not set, using base64 fallback")
                        credentialsEncrypted = Buffer.from(JSON.stringify(credentialsForDownload)).toString("base64")
                    }
                } catch (e: unknown) {
                    const errorMessage = e instanceof Error ? e.message : String(e)
                    logger.error("Encryption failed, using base64 fallback", { error: errorMessage })
                    credentialsEncrypted = Buffer.from(JSON.stringify(credentialsForDownload)).toString("base64")
                }

                // Update job as complete
                const finalStatus = failedItems.length === 0 ? "completed" : "completed_with_errors"

                await supabaseAdmin.from("bulk_import_jobs").update({
                    status: finalStatus,
                    step: "completed",
                    processed_properties: tx.createdProperties.length,
                    failed_properties: failedItems.length,
                    created_property_ids: tx.createdProperties.map((p) => p.id),
                    created_owner_ids: tx.createdOwners.map((o) => o.id),
                    failed_items: failedItems,
                    credentials_encrypted: credentialsEncrypted,
                    completed_at: new Date().toISOString(),
                }).eq("id", jobId)

                // Log completion
                await supabaseAdmin.from("bulk_import_audit_log").insert({
                    job_id: jobId,
                    admin_id: authUser.id,
                    action: "import_completed",
                    details: {
                        total_properties: properties.length,
                        created_properties: tx.createdProperties.length,
                        failed_properties: failedItems.length,
                        new_owners: tx.createdOwners.length,
                        final_status: finalStatus,
                        transaction_id: tx.jobId,
                    },
                })

                // Send success response
                const hasWarnings = failedItems.some((item) => item.severity === "warning")
                const hasErrors = failedItems.some((item) => !item.severity || item.severity === "error")

                send({
                    status: hasErrors
                        ? "Import completed with errors"
                        : hasWarnings
                            ? "Import completed with warnings"
                            : "Import completed successfully",
                    progress: 100,
                    completed: true,
                    success: !hasErrors,
                    partial_success: hasErrors && tx.createdProperties.length > 0,
                    results: {
                        total_properties: properties.length,
                        created_properties: tx.createdProperties.length,
                        failed_properties: failedItems.filter((i) => !i.severity || i.severity === "error").length,
                        warning_count: failedItems.filter((i) => i.severity === "warning").length,
                        new_owners: tx.createdOwners.filter((o) => o.password !== "[ALREADY EXISTS]").length,
                        existing_owners: tx.createdOwners.filter((o) => o.password === "[ALREADY EXISTS]").length,
                        failed_items: failedItems,
                    },
                    credentials_count: credentialsForDownload.length,
                    message: hasErrors
                        ? `Import completed but ${failedItems.filter((i) => !i.severity || i.severity === "error").length} items failed.`
                        : hasWarnings
                            ? `Import completed with ${failedItems.filter((i) => i.severity === "warning").length} warnings.`
                            : `All ${tx.createdProperties.length} properties imported successfully.`,
                })

                releaseProcessingLock(jobId)
                controller.close()
            } catch (error: unknown) {
                releaseProcessingLock(jobId)

                const errorMessage = error instanceof Error ? error.message : "Import failed"
                logger.error("Import confirmation error", { error: errorMessage, jobId })

                const isCriticalError =
                    errorMessage.includes("Critical failure") || errorMessage.includes("Simulated failure")

                let rollbackInfo = null
                if (tx) {
                    try {
                        const rollbackResult = await rollbackTransaction(tx)
                        logger.info("Rollback result", { success: rollbackResult.success, jobId })
                        rollbackInfo = {
                            rollback_performed: true,
                            rollback_success: rollbackResult.success,
                            rollback_details: rollbackResult.details,
                            rollback_errors: rollbackResult.errors,
                        }
                    } catch (rollbackError: unknown) {
                        const rollbackErrorMessage =
                            rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
                        logger.error("Rollback failed", { error: rollbackErrorMessage, jobId })
                        rollbackInfo = {
                            rollback_performed: true,
                            rollback_success: false,
                            rollback_error: rollbackErrorMessage,
                        }
                    }
                }

                const errorResponse: Record<string, unknown> = {
                    error: errorMessage,
                    error_type: isCriticalError ? "critical" : "general",
                    progress: 0,
                    completed: false,
                    suggestion: isCriticalError
                        ? "The import encountered a critical error and was rolled back."
                        : "Please check the error details and retry.",
                    ...rollbackInfo,
                }

                try {
                    send(errorResponse)
                } catch (sendError: unknown) {
                    logger.error("Failed to send error response", {
                        error: sendError instanceof Error ? sendError.message : String(sendError),
                        jobId,
                    })
                }

                const jobUpdatePromise = supabaseAdmin
                    .from("bulk_import_jobs")
                    .update({
                        status: "failed",
                        error_message: errorMessage,
                        error_details: {
                            stack: error instanceof Error ? error.stack : undefined,
                            type: error instanceof Error ? error.name : "Unknown",
                        },
                        failed_items: failedItems.length > 0 ? failedItems : null,
                    })
                    .eq("id", jobId)

                const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 2000))
                await Promise.race([jobUpdatePromise, timeoutPromise])

                controller.close()
            }
        },
    })

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    })
}
