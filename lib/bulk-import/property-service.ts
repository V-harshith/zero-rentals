/**
 * Bulk Import System - Property Service
 *
 * Handles property creation and image management.
 */

import { supabaseAdmin } from "@/lib/supabase-admin"
import { logger } from "./logger"
import { checkIdempotency, recordIdempotency } from "./idempotency"
import {
    trackCreatedProperty,
    markItemProcessed,
    isItemProcessed,
    shouldSimulateFailure,
    type TransactionContext,
} from "@/lib/bulk-import-transaction"

export interface PropertyData {
    psn: string
    property_name: string
    owner_email: string
    owner_name: string
    owner_phone?: string
    property_data: Record<string, unknown>
}

export interface StagedImage {
    filename?: string
    storage_path?: string
    public_url?: string
}

export interface PropertyCreationResult {
    success: boolean
    propertyId?: string
    error?: string
    imageMoveErrors?: string[]
}

export interface ImageMoveResult {
    permanentUrls: string[]
    errors: string[]
}

/**
 * Move images from staging to permanent location
 */
export async function moveImagesToPermanent(
    propertyImages: StagedImage[],
    propertyId: string,
    jobId: string,
    psn: string
): Promise<ImageMoveResult> {
    const permanentUrls: string[] = []
    const errors: string[] = []

    for (let index = 0; index < propertyImages.length; index++) {
        const image = propertyImages[index]
        const stagingPath = image.storage_path

        if (!stagingPath) {
            logger.error("No storage_path for image", { psn, index })
            errors.push(`Missing storage_path for image ${index}`)
            if (image.public_url) {
                permanentUrls.push(image.public_url)
            }
            continue
        }

        // Validate staging path format
        if (!stagingPath.startsWith("staging/")) {
            permanentUrls.push(image.public_url || "")
            continue
        }

        // Create permanent path: properties/{propertyId}/{index}.jpg
        const extension = stagingPath.split(".").pop() || "jpg"
        const permanentPath = `properties/${propertyId}/${index}.${extension}`

        try {
            const { error: moveError } = await supabaseAdmin.storage
                .from("property-images")
                .move(stagingPath, permanentPath)

            if (moveError) {
                logger.error("Failed to move image", {
                    stagingPath,
                    permanentPath,
                    error: moveError.message,
                })
                errors.push(`Failed to move image ${index}: ${moveError.message}`)
                permanentUrls.push(image.public_url || "")
                continue
            }

            const { data: publicUrlData } = supabaseAdmin.storage
                .from("property-images")
                .getPublicUrl(permanentPath)

            if (publicUrlData?.publicUrl) {
                permanentUrls.push(publicUrlData.publicUrl)
            } else {
                logger.error("Failed to get public URL", { permanentPath })
                errors.push(`Failed to get public URL for image ${index}`)
                permanentUrls.push(image.public_url || "")
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            logger.error("Exception moving image", { stagingPath, error: errorMessage })
            errors.push(`Exception moving image ${index}: ${errorMessage}`)
            permanentUrls.push(image.public_url || "")
        }
    }

    return { permanentUrls, errors }
}

/**
 * Fetch staged images from database as fallback
 */
export async function fetchStagedImages(
    jobId: string,
    psnKey: string
): Promise<StagedImage[]> {
    const { data: stagedImages, error: stagedError } = await supabaseAdmin
        .from("bulk_import_staged_images")
        .select("*")
        .eq("job_id", jobId)
        .eq("extracted_psn", psnKey)
        .eq("status", "uploaded")

    if (stagedError) {
        logger.error("Error querying staged images", {
            error: stagedError.message,
            jobId,
            psnKey,
        })
        return []
    }

    if (!stagedImages || stagedImages.length === 0) {
        return []
    }

    return stagedImages.map((img) => ({
        filename: img.filename,
        storage_path: img.storage_path,
        public_url: supabaseAdmin.storage
            .from("property-images")
            .getPublicUrl(img.storage_path).data.publicUrl,
    }))
}

/**
 * Create property atomically
 */
export async function createPropertyAtomically(
    prop: PropertyData,
    ownerId: string,
    imagesByPSN: Record<string, StagedImage[]>,
    jobId: string,
    adminId: string,
    tx: TransactionContext,
    batchNumber: number,
    itemNumber: number
): Promise<PropertyCreationResult> {
    const idempotencyKey = `property:${prop.psn}`

    // Check idempotency
    if (isItemProcessed(tx, idempotencyKey)) {
        const existing = tx.createdProperties.find((p) => p.psn === prop.psn)
        return { success: true, propertyId: existing?.id }
    }

    const existingCheck = await checkIdempotency(jobId, "property_created", prop.psn)
    if (existingCheck.completed && existingCheck.result) {
        const result = existingCheck.result as { propertyId: string }
        markItemProcessed(tx, idempotencyKey)
        trackCreatedProperty(tx, { id: result.propertyId, psn: prop.psn, ownerId })
        return { success: true, propertyId: result.propertyId }
    }

    // Simulate failure for testing
    if (shouldSimulateFailure(tx, "property", batchNumber, itemNumber)) {
        const error = `Simulated failure for property ${prop.psn} at batch ${batchNumber}, item ${itemNumber}`
        await recordIdempotency(jobId, adminId, "property_created", prop.psn, "failed", { error })
        return { success: false, error }
    }

    try {
        // Get images for this property
        const psnKey = String(prop.psn).trim()
        let propertyImages = imagesByPSN[psnKey] || []

        // Fallback to direct database query if images not found in job record
        if (propertyImages.length === 0) {
            propertyImages = await fetchStagedImages(jobId, psnKey)
        }

        // Log warning if property will be created without images
        if (propertyImages.length === 0) {
            logger.warn("Property will be created with empty images array", { psn: psnKey, jobId })
        }

        // Build property data WITHOUT images first (to get property ID)
        const propertyData = {
            ...prop.property_data,
            owner_id: ownerId,
            owner_name: prop.owner_name,
            owner_contact: prop.owner_phone || (prop.property_data?.owner_contact as string) || "",
            images: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            published_at: new Date().toISOString(),
            status: "active",
            availability: "Available",
            bulk_import_job_id: jobId,
            bulk_import_psn: prop.psn,
        }

        // Insert property without images first
        const { data: insertedProp, error: propError } = await supabaseAdmin
            .from("properties")
            .insert(propertyData)
            .select("id")
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
                logger.warn("Some images failed to move for property", { propertyId, errors: imageMoveErrors })
            }

            // Update property with permanent image URLs
            if (permanentImageUrls.length > 0) {
                const { error: updateError } = await supabaseAdmin
                    .from("properties")
                    .update({ images: permanentImageUrls })
                    .eq("id", propertyId)

                if (updateError) {
                    logger.error("Failed to update property with permanent URLs", {
                        propertyId,
                        error: updateError.message,
                    })
                }
            }

            // Update staged images to assigned with property_id reference
            const { error: stagedUpdateError } = await supabaseAdmin
                .from("bulk_import_staged_images")
                .update({
                    status: "assigned",
                    property_id: propertyId,
                    processed_at: new Date().toISOString(),
                })
                .eq("job_id", jobId)
                .eq("extracted_psn", psnKey)

            if (stagedUpdateError) {
                logger.error("Failed to update staged images status", {
                    psn: psnKey,
                    error: stagedUpdateError.message,
                })
            }
        }

        // Track in transaction context
        trackCreatedProperty(tx, { id: propertyId, psn: prop.psn, ownerId })
        markItemProcessed(tx, idempotencyKey)

        // Record idempotency
        await recordIdempotency(jobId, adminId, "property_created", prop.psn, "completed", {
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

        return {
            success: true,
            propertyId,
            imageMoveErrors: imageMoveErrors.length > 0 ? imageMoveErrors : undefined,
        }
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error("Failed to create property", { psn: prop.psn, error: errorMessage })
        await recordIdempotency(jobId, adminId, "property_created", prop.psn, "failed", {
            error: errorMessage,
        })
        return { success: false, error: errorMessage }
    }
}
