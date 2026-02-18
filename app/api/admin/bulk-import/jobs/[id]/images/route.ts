import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { csrfProtection } from "@/lib/csrf-server"
import { hasConcurrentProcessingJob } from "@/lib/bulk-import-queue"

// Note: Body size limit is configured in next.config.mjs (api.bodyParser.sizeLimit)
// and vercel.json (maxDuration)

// ============================================================================
// Extract PSN from file path
// Expected format: "Harshth Prop Pics/1053/image.jpg" where 1053 is PSN
// ============================================================================
function extractPSNFromPath(filepath: string): string | null {
    // Remove leading/trailing slashes and normalize
    const normalizedPath = filepath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    const parts = normalizedPath.split('/')

    // Try folder name first (should be the first folder after root)
    // Format: "Harshth Prop Pics/1053/image.jpg" or "1053/image.jpg"
    if (parts.length >= 2) {
        const potentialPsn = parts[parts.length - 2] // Second to last is folder name

        // PSN should be numeric (digits only, max 10 digits) - strict validation for security
        if (/^\d{1,10}$/.test(potentialPsn)) {
            return potentialPsn
        }
    }

    // Try filename patterns as fallback
    const filename = parts[parts.length - 1] || ''
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '')

    // Patterns: "155", "PSN-155", "155-1", "155_1"
    const patterns = [
        /^(\d+)$/,           // 155 (numeric only)
        /^PSN-?(\d+)$/i,     // PSN-155, PSN155
        /^(\d+)[-_]\d+$/,    // 155-1, 155_1
    ]

    for (const pattern of patterns) {
        const match = nameWithoutExt.match(pattern)
        if (match) {
            return match[1]
        }
    }

    return null
}

// ============================================================================
// Helper: Validate image file type using magic numbers (file signatures)
// This is more secure than just checking MIME type which can be spoofed
// ============================================================================
async function validateImageFile(file: File): Promise<{ valid: boolean; error?: string }> {
    // Read first 12 bytes to check magic numbers
    const buffer = await file.slice(0, 12).arrayBuffer()
    const bytes = new Uint8Array(buffer)

    // Check magic numbers for common image formats
    const isJPEG = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF
    const isPNG = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
    const isGIF = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38
    const isWebP = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
                   bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50

    if (!isJPEG && !isPNG && !isGIF && !isWebP) {
        return { valid: false, error: `Invalid file format. Only JPEG, PNG, GIF, and WebP are allowed.` }
    }

    // Verify file extension matches content
    const ext = file.name.split('.').pop()?.toLowerCase()
    const validExts = ['jpg', 'jpeg', 'png', 'gif', 'webp']
    if (!ext || !validExts.includes(ext)) {
        return { valid: false, error: `Invalid file extension. Use: ${validExts.join(', ')}` }
    }

    return { valid: true }
}

// ============================================================================
// ARCHITECTURE: Image Upload Limits
// ----------------------------------------------------------------------------
// - Total images per import: 500 (hard limit to prevent memory/timeout issues)
// - Images per property (PSN): 10 recommended (warning if exceeded)
//   Only first 10 images will be used during property creation
// ============================================================================

// ============================================================================
// POST /api/admin/bulk-import/jobs/[id]/images
// Upload image folder
// ============================================================================

// Body size limit for Vercel free tier (4.5MB max, using 3.5MB for safety margin)
export const bodyParser = {
  sizeLimit: '3.5mb',
}

// Maximum recommended images per PSN (warning threshold)
const MAX_IMAGES_PER_PSN = 10

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

            try {
                // CSRF protection
                const csrfCheck = await csrfProtection(request)
                if (!csrfCheck.valid) {
                    send({ error: csrfCheck.error || 'CSRF token missing' })
                    controller.close()
                    return
                }

                // Auth check
                const supabase = await createClient()
                const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

                if (authError || !authUser) {
                    send({ error: "Unauthorized" })
                    controller.close()
                    return
                }

                // Verify job exists and belongs to admin
                // Also fetch existing images_by_psn to MERGE with new batch (not overwrite)
                const { data: job } = await supabaseAdmin
                    .from("bulk_import_jobs")
                    .select("id, status, parsed_properties, admin_id, images_by_psn, orphaned_images, total_images")
                    .eq("id", jobId)
                    .single()

                if (!job) {
                    send({ error: "Job not found" })
                    controller.close()
                    return
                }

                if (job.admin_id !== authUser.id) {
                    send({ error: "Access denied" })
                    controller.close()
                    return
                }

                // Check for concurrent processing job
                const hasConcurrent = await hasConcurrentProcessingJob(authUser.id)
                if (hasConcurrent) {
                    send({ error: "You have an import job currently being processed. Please wait for it to complete." })
                    controller.close()
                    return
                }

                if (job.status !== "excel_parsed" && job.status !== "images_uploaded") {
                    send({ error: "Job is not ready for image upload. Please upload Excel first." })
                    controller.close()
                    return
                }

                // Update job status
                await supabaseAdmin
                    .from("bulk_import_jobs")
                    .update({ status: "uploading_images" })
                    .eq("id", jobId)

                send({ status: "Parsing uploaded files..." })

                // Parse form data
                const formData = await request.formData()
                const files: File[] = []

                // CRITICAL FIX: Build path map from separate path fields
                const pathMap = new Map<number, string>()
                for (const [key, value] of formData.entries()) {
                    if (key.startsWith('path_')) {
                        const index = parseInt(key.replace('path_', ''))
                        pathMap.set(index, value as string)
                    }
                }

                // Get all files from form data - PRESERVE INDEX ASSOCIATION
                const invalidFiles: string[] = []
                const validationPromises: Promise<void>[] = []

                for (const [key, value] of formData.entries()) {
                    // CRITICAL FIX: Look for image_* keys to maintain index association with paths
                    if (value instanceof File && key.startsWith('image_')) {
                        const index = parseInt(key.replace('image_', ''))
                        if (value.type.startsWith('image/')) {
                            // Validate file using magic numbers (async)
                            validationPromises.push(
                                validateImageFile(value).then(result => {
                                    if (result.valid) {
                                        files[index] = value  // Use index to maintain association with pathMap
                                    } else {
                                        invalidFiles.push(`${value.name}: ${result.error}`)
                                    }
                                })
                            )
                        } else {
                            invalidFiles.push(`${value.name}: Not an image file`)
                        }
                    }
                }

                // Wait for all validations to complete
                await Promise.all(validationPromises)

                // Filter out any empty slots from skipped invalid files
                const validFiles = files.filter(f => f !== undefined)

                if (validFiles.length === 0) {
                    send({
                        error: "No valid image files found",
                        invalid_files: invalidFiles.slice(0, 20),
                        total_invalid: invalidFiles.length
                    })
                    controller.close()
                    return
                }

                // Validate file count
                if (validFiles.length > 500) {
                    send({ error: `Too many images. Maximum is 500 images per import. You have ${validFiles.length} valid images.` })
                    controller.close()
                    return
                }

                // Get expected PSNs from parsed properties
                const parsedProperties = job.parsed_properties as any[] || []
                // CRITICAL: Normalize PSN to string (Excel may parse as number)
                const expectedPSNs = parsedProperties.map((p: any) => String(p.psn))

                send({
                    status: `Processing ${validFiles.length} images...`,
                    total: validFiles.length,
                    expected_psns: expectedPSNs.length,
                })

                // Categorize images by PSN
                const imagesByPSN: Record<string, any[]> = {}
                const orphanedImages: any[] = []
                const unmatchedFiles: string[] = []

                // CRITICAL: Use files array directly (sparse array), NOT filtered validFiles
                // Filtering breaks index alignment with pathMap!
                const validIndices = Object.keys(files).map(Number).filter(i => files[i] !== undefined)

                for (const fileIndex of validIndices) {
                    const file = files[fileIndex]
                    // CRITICAL FIX: Use path from pathMap with guaranteed index association
                    const relativePath = pathMap.get(fileIndex) || file.name
                    const psn = extractPSNFromPath(relativePath)

                    if (!psn) {
                        unmatchedFiles.push(file.name)
                        continue
                    }

                    const imageInfo = {
                        filename: file.name,
                        original_path: relativePath,
                        extracted_psn: psn,
                        file_size: file.size,
                        mime_type: file.type,
                    }

                    // CRITICAL FIX: Normalize both sides to strings and trim
                    const normalizedPsn = String(psn).trim()
                    const normalizedExpectedPSNs = expectedPSNs.map((p: string) => String(p).trim())
                    const isMatched = normalizedExpectedPSNs.includes(normalizedPsn)

                    if (isMatched) {
                        if (!imagesByPSN[normalizedPsn]) imagesByPSN[normalizedPsn] = []
                        imagesByPSN[normalizedPsn].push({ ...imageInfo, file })
                    } else {
                        orphanedImages.push(imageInfo)
                    }
                }

                // Check for PSNs with too many images (generate warnings)
                const warnings: string[] = []
                for (const [psn, images] of Object.entries(imagesByPSN)) {
                    if (images.length > MAX_IMAGES_PER_PSN) {
                        warnings.push(
                            `Property ${psn} has ${images.length} images (max ${MAX_IMAGES_PER_PSN} recommended). Only first ${MAX_IMAGES_PER_PSN} will be used.`
                        )
                    }
                }

                send({
                    status: `Matched ${Object.keys(imagesByPSN).length} PSNs, ${orphanedImages.length} orphaned`,
                    matched_psns: Object.keys(imagesByPSN).length,
                    orphaned_count: orphanedImages.length,
                    progress: 10,
                    warnings: warnings.length > 0 ? warnings : undefined,
                })

                // Verify supabaseAdmin is configured
                const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
                if (!serviceKey) {
                    console.error('[Upload] CRITICAL: SUPABASE_SERVICE_ROLE_KEY not configured')
                    send({ error: "Server storage not configured. Please contact support." })
                    controller.close()
                    return
                }

                // Upload images to storage
                const uploadedImages: Record<string, any[]> = {}
                const totalImages = validIndices.length - unmatchedFiles.length - orphanedImages.length
                let processedCount = 0
                let failedCount = 0
                const failedUploads: string[] = []

                const psnList = Object.keys(imagesByPSN)

                for (let i = 0; i < psnList.length; i++) {
                    const psn = psnList[i]
                    const psnImages = imagesByPSN[psn]
                    uploadedImages[psn] = []

                    for (let j = 0; j < psnImages.length; j++) {
                        const img = psnImages[j]

                        try {
                            // Generate unique filename
                            const timestamp = Date.now()
                            const uniqueFilename = `${timestamp}-${j}.jpg`
                            const storagePath = `staging/${jobId}/${psn}/${uniqueFilename}`

                            // Upload to Supabase Storage
                            // Note: Images are already compressed client-side (max 2MB)
                            const { data: uploadData, error: uploadError } = await supabaseAdmin
                                .storage
                                .from("property-images")
                                .upload(storagePath, img.file, {
                                    contentType: "image/jpeg",
                                    upsert: false,
                                })

                            if (uploadError) {
                                console.error(`[Upload] Upload error for ${img.filename}:`, uploadError)
                                throw uploadError
                            }

                            // Get public URL
                            const { data: publicUrl } = supabaseAdmin
                                .storage
                                .from("property-images")
                                .getPublicUrl(storagePath)

                            // Store in database
                            const { data: stagedImage } = await supabaseAdmin
                                .from("bulk_import_staged_images")
                                .insert({
                                    job_id: jobId,
                                    filename: img.filename,
                                    original_path: img.original_path,
                                    extracted_psn: psn,
                                    storage_path: storagePath,
                                    file_size: img.file_size,
                                    mime_type: img.mime_type,
                                    status: "uploaded",
                                })
                                .select()
                                .single()

                            uploadedImages[psn].push({
                                id: stagedImage?.id,
                                filename: img.filename,
                                storage_path: storagePath,
                                public_url: publicUrl.publicUrl,
                            })

                            processedCount++
                        } catch (error: any) {
                            failedCount++
                            failedUploads.push(`${img.filename}: ${error.message}`)

                            // Store failed record
                            await supabaseAdmin
                                .from("bulk_import_staged_images")
                                .insert({
                                    job_id: jobId,
                                    filename: img.filename,
                                    original_path: img.original_path,
                                    extracted_psn: psn,
                                    status: "failed",
                                    error_message: error.message,
                                })
                        }

                        // Send progress every 5 images
                        if ((processedCount + failedCount) % 5 === 0 || (processedCount + failedCount) === totalImages) {
                            send({
                                progress: Math.round(10 + ((processedCount + failedCount) / totalImages) * 80),
                                processed: processedCount,
                                failed: failedCount,
                                total: totalImages,
                                status: `Uploaded ${processedCount} images...`,
                            })
                        }
                    }
                }

                // Store orphaned images
                for (const img of orphanedImages) {
                    await supabaseAdmin
                        .from("bulk_import_staged_images")
                        .insert({
                            job_id: jobId,
                            filename: img.filename,
                            original_path: img.original_path,
                            extracted_psn: img.extracted_psn,
                            file_size: img.file_size,
                            mime_type: img.mime_type,
                            status: "orphaned",
                        })
                }

                // Prepare images_by_psn for job record
                // CRITICAL: Merge with existing images from previous batches (don't overwrite!)
                const existingImagesByPSN = (job.images_by_psn as Record<string, any[]>) || {}
                const imagesByPSNForDB: Record<string, any[]> = {}

                // First, copy existing images
                for (const [psn, images] of Object.entries(existingImagesByPSN)) {
                    imagesByPSNForDB[psn] = [...images] // Clone array
                }

                // Then, merge new images
                for (const [psn, images] of Object.entries(uploadedImages)) {
                    if (!imagesByPSNForDB[psn]) imagesByPSNForDB[psn] = []
                    imagesByPSNForDB[psn].push(...images.map(img => ({
                        filename: img.filename,
                        storage_path: img.storage_path,
                        public_url: img.public_url,
                    })))
                }

                // Merge orphaned images with existing
                const existingOrphaned = (job.orphaned_images as any[]) || []
                const mergedOrphaned = [...existingOrphaned, ...orphanedImages.map(img => ({
                    filename: img.filename,
                    extracted_psn: img.extracted_psn,
                }))]

                // Calculate total images across all batches
                const existingTotal = job.total_images || 0
                const newTotal = existingTotal + processedCount

                // Update job with MERGED data (don't overwrite previous batches!)
                const { error: updateError } = await supabaseAdmin
                    .from("bulk_import_jobs")
                    .update({
                        status: "images_uploaded",
                        step: "review",
                        total_images: newTotal,
                        images_by_psn: imagesByPSNForDB,
                        orphaned_images: mergedOrphaned,
                        images_uploaded_at: new Date().toISOString(),
                    })
                    .eq("id", jobId)
                    .select()

                if (updateError) {
                    console.error(`[Bulk Import] CRITICAL: Failed to update job with images_by_psn:`, updateError)
                    throw new Error(`Failed to save image mappings: ${updateError.message}`)
                }

                // Log audit with cumulative counts
                await supabaseAdmin.from("bulk_import_audit_log").insert({
                    job_id: jobId,
                    admin_id: authUser.id,
                    action: "images_uploaded",
                    details: {
                        batch_files: validIndices.length,
                        batch_valid_images: processedCount,
                        batch_failed_uploads: failedCount,
                        batch_orphaned_images: orphanedImages.length,
                        batch_matched_psns: Object.keys(uploadedImages).length,
                        cumulative_total_images: newTotal,
                        cumulative_matched_psns: Object.keys(imagesByPSNForDB).length,
                        cumulative_orphaned_images: mergedOrphaned.length,
                        is_batch: true,
                    },
                })

                // Regenerate warnings for final response (based on uploaded images)
                const finalWarnings: string[] = []
                for (const [psn, images] of Object.entries(uploadedImages)) {
                    if (images.length > MAX_IMAGES_PER_PSN) {
                        finalWarnings.push(
                            `Property ${psn} has ${images.length} images (max ${MAX_IMAGES_PER_PSN} recommended). Only first ${MAX_IMAGES_PER_PSN} will be used.`
                        )
                    }
                }

                // Calculate cumulative totals across all batches
                const cumulativeTotal = (job.total_images || 0) + processedCount
                const cumulativeMatchedPSNs = Object.keys(existingImagesByPSN).length + Object.keys(uploadedImages).length

                send({
                    status: "Images uploaded successfully",
                    progress: 100,
                    total_images: cumulativeTotal, // Cumulative total across all batches
                    failed_uploads: failedCount,
                    orphaned_images: orphanedImages.length,
                    matched_psns: cumulativeMatchedPSNs, // Cumulative matched PSNs
                    unmatched_psns: expectedPSNs.filter(psn => !uploadedImages[psn] && !existingImagesByPSN[psn]),
                    failed_files: failedUploads,
                    invalid_files: [...invalidFiles, ...unmatchedFiles].slice(0, 20),
                    validation_errors: invalidFiles.length > 0 ? invalidFiles.slice(0, 10) : undefined,
                    warnings: finalWarnings.length > 0 ? finalWarnings : undefined,
                })

                controller.close()
            } catch (error: any) {
                console.error("Image upload error:", error)

                // Update job with error
                await supabaseAdmin
                    .from("bulk_import_jobs")
                    .update({
                        status: "failed",
                        error_message: error.message,
                    })
                    .eq("id", jobId)

                send({ error: error.message || "Failed to process images" })
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
