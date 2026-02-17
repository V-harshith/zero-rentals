import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { csrfProtection } from "@/lib/csrf-server"
import { hasConcurrentProcessingJob } from "@/lib/bulk-import-queue"

// ============================================================================
// Extract PSN from file path
// Expected format: "Harshth Prop Pics/1053/image.jpg" where 1053 is PSN
// ============================================================================
function extractPSNFromPath(filepath: string): string | null {
    console.log(`[PSN Extraction] Processing path: "${filepath}"`)

    // Remove leading/trailing slashes and normalize
    const normalizedPath = filepath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    const parts = normalizedPath.split('/')

    console.log(`[PSN Extraction] Normalized path: "${normalizedPath}", Parts:`, parts)

    // Try folder name first (should be the first folder after root)
    // Format: "Harshth Prop Pics/1053/image.jpg" or "1053/image.jpg"
    if (parts.length >= 2) {
        const potentialPsn = parts[parts.length - 2] // Second to last is folder name
        console.log(`[PSN Extraction] Checking folder name: "${potentialPsn}"`)

        // PSN should be numeric (digits only, max 10 digits) - strict validation for security
        if (/^\d{1,10}$/.test(potentialPsn)) {
            console.log(`[PSN Extraction] SUCCESS - Extracted PSN "${potentialPsn}" from folder name`)
            return potentialPsn
        }
        console.log(`[PSN Extraction] Folder name "${potentialPsn}" does not match numeric pattern`)
    } else {
        console.log(`[PSN Extraction] Path has less than 2 parts, cannot extract folder name`)
    }

    // Try filename patterns as fallback
    const filename = parts[parts.length - 1] || ''
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '')

    console.log(`[PSN Extraction] Trying filename fallback: "${nameWithoutExt}"`)

    // Patterns: "155", "PSN-155", "155-1", "155_1"
    const patterns = [
        /^(\d+)$/,           // 155 (numeric only)
        /^PSN-?(\d+)$/i,     // PSN-155, PSN155
        /^(\d+)[-_]\d+$/,    // 155-1, 155_1
    ]

    for (const pattern of patterns) {
        const match = nameWithoutExt.match(pattern)
        if (match) {
            console.log(`[PSN Extraction] SUCCESS - Extracted PSN "${match[1]}" from filename`)
            return match[1]
        }
    }

    console.log(`[PSN Extraction] FAILED - Could not extract PSN from path: "${filepath}"`)
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

// Increase body size limit for image uploads (prevents 413 Payload Too Large)
export const bodyParser = {
  sizeLimit: '10mb',
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
                const { data: job } = await supabaseAdmin
                    .from("bulk_import_jobs")
                    .select("id, status, parsed_properties, admin_id")
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

                // Get all files from form data
                console.log(`[Image Upload] Parsing form data entries...`)
                const invalidFiles: string[] = []
                const validationPromises: Promise<void>[] = []

                for (const [key, value] of formData.entries()) {
                    console.log(`[Image Upload] Form entry: key="${key}", type="${value instanceof File ? 'File' : typeof value}"`)
                    if (value instanceof File) {
                        console.log(`[Image Upload] File details: name="${value.name}", type="${value.type}", size=${value.size}, webkitRelativePath="${(value as any).webkitRelativePath || 'N/A'}"`)
                        if (value.type.startsWith('image/')) {
                            // Validate file using magic numbers (async)
                            validationPromises.push(
                                validateImageFile(value).then(result => {
                                    if (result.valid) {
                                        files.push(value)
                                    } else {
                                        invalidFiles.push(`${value.name}: ${result.error}`)
                                        console.log(`[Image Upload] SKIPPED - ${result.error}`)
                                    }
                                })
                            )
                        } else {
                            invalidFiles.push(`${value.name}: Not an image file`)
                            console.log(`[Image Upload] SKIPPED - Not an image file`)
                        }
                    }
                }

                // Wait for all validations to complete
                await Promise.all(validationPromises)

                console.log(`[Image Upload] Total valid image files: ${files.length}, Invalid: ${invalidFiles.length}`)

                if (files.length === 0) {
                    send({
                        error: "No valid image files found",
                        invalid_files: invalidFiles.slice(0, 20),
                        total_invalid: invalidFiles.length
                    })
                    controller.close()
                    return
                }

                // Validate file count
                if (files.length > 500) {
                    send({ error: `Too many images. Maximum is 500 images per import. You have ${files.length} valid images.` })
                    controller.close()
                    return
                }

                // Get expected PSNs from parsed properties
                const parsedProperties = job.parsed_properties as any[] || []
                const expectedPSNs = parsedProperties.map((p: any) => p.psn)

                console.log(`[Image Upload] Expected PSNs from Excel:`, expectedPSNs)

                send({
                    status: `Processing ${files.length} images...`,
                    total: files.length,
                    expected_psns: expectedPSNs.length,
                })

                // Categorize images by PSN
                const imagesByPSN: Record<string, any[]> = {}
                const orphanedImages: any[] = []
                const unmatchedFiles: string[] = []

                console.log(`[Image Upload] Starting PSN extraction for ${files.length} files...`)

                for (const file of files) {
                    // Get relative path from webkitRelativePath
                    const relativePath = (file as any).webkitRelativePath || file.name
                    console.log(`[Image Upload] Processing file: "${file.name}", relativePath: "${relativePath}"`)
                    const psn = extractPSNFromPath(relativePath)

                    if (!psn) {
                        console.log(`[Image Upload] No PSN extracted for file "${file.name}" - marking as invalid`)
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

                    console.log(`[Image Upload] File "${file.name}" -> PSN "${psn}", expected: ${expectedPSNs.includes(psn)}`)

                    if (expectedPSNs.includes(psn)) {
                        if (!imagesByPSN[psn]) imagesByPSN[psn] = []
                        imagesByPSN[psn].push({ ...imageInfo, file })
                    } else {
                        orphanedImages.push(imageInfo)
                    }
                }

                console.log(`[Image Upload] Categorization complete:`, {
                    matchedPSNs: Object.keys(imagesByPSN),
                    matchedCount: Object.values(imagesByPSN).flat().length,
                    orphanedCount: orphanedImages.length,
                    invalidCount: unmatchedFiles.length,
                    invalidFiles: unmatchedFiles.slice(0, 10) // First 10 invalid files
                })

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
                console.log('[Upload] Checking Supabase admin configuration...')
                const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
                if (!serviceKey) {
                    console.error('[Upload] CRITICAL: SUPABASE_SERVICE_ROLE_KEY not configured')
                    send({ error: "Server storage not configured. Please contact support." })
                    controller.close()
                    return
                }
                console.log('[Upload] Supabase admin configured, service key present')

                // Upload images to storage
                const uploadedImages: Record<string, any[]> = {}
                const totalImages = files.length - unmatchedFiles.length - orphanedImages.length
                let processedCount = 0
                let failedCount = 0
                const failedUploads: string[] = []

                const psnList = Object.keys(imagesByPSN)
                console.log(`[Upload] Starting upload for ${psnList.length} PSNs, ${totalImages} total images`)

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

                            console.log(`[Upload] Uploading to path: ${storagePath}, bucket: property-images, fileSize: ${img.file_size}`)

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

                            console.log(`[Upload] Successfully uploaded ${img.filename} to ${storagePath}`)

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
                const imagesByPSNForDB: Record<string, any[]> = {}
                for (const [psn, images] of Object.entries(uploadedImages)) {
                    imagesByPSNForDB[psn] = images.map(img => ({
                        filename: img.filename,
                        storage_path: img.storage_path,
                        public_url: img.public_url,
                    }))
                }

                // Update job
                await supabaseAdmin
                    .from("bulk_import_jobs")
                    .update({
                        status: "images_uploaded",
                        step: "review",
                        total_images: processedCount,
                        images_by_psn: imagesByPSNForDB,
                        orphaned_images: orphanedImages.map(img => ({
                            filename: img.filename,
                            extracted_psn: img.extracted_psn,
                        })),
                        images_uploaded_at: new Date().toISOString(),
                    })
                    .eq("id", jobId)

                // Log audit
                await supabaseAdmin.from("bulk_import_audit_log").insert({
                    job_id: jobId,
                    admin_id: authUser.id,
                    action: "images_uploaded",
                    details: {
                        total_files: files.length,
                        valid_images: processedCount,
                        failed_uploads: failedCount,
                        orphaned_images: orphanedImages.length,
                        matched_psns: Object.keys(uploadedImages).length,
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

                send({
                    status: "Images uploaded successfully",
                    progress: 100,
                    total_images: processedCount,
                    failed_uploads: failedCount,
                    orphaned_images: orphanedImages.length,
                    matched_psns: Object.keys(uploadedImages).length,
                    unmatched_psns: expectedPSNs.filter(psn => !uploadedImages[psn]),
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
