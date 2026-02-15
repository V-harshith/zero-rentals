import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"

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
        if (/^\d+$/.test(potentialPsn)) {
            return potentialPsn
        }
    }

    // Try filename patterns as fallback
    const filename = parts[parts.length - 1] || ''
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '')

    // Patterns: "155", "PSN-155", "155-1", "155_1"
    const patterns = [
        /^(\d+)$/,           // 155
        /^PSN-?(\d+)$/i,     // PSN-155, PSN155
        /^(\d+)[-_]\d+$/,    // 155-1, 155_1
    ]

    for (const pattern of patterns) {
        const match = nameWithoutExt.match(pattern)
        if (match) return match[1]
    }

    return null
}

// ============================================================================
// POST /api/admin/bulk-import/jobs/[id]/images
// Upload image folder
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

            try {
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
                for (const [key, value] of formData.entries()) {
                    if (value instanceof File && value.type.startsWith('image/')) {
                        files.push(value)
                    }
                }

                if (files.length === 0) {
                    send({ error: "No image files found" })
                    controller.close()
                    return
                }

                // Validate file count
                if (files.length > 500) {
                    send({ error: "Too many images. Maximum is 500 images per import" })
                    controller.close()
                    return
                }

                // Get expected PSNs from parsed properties
                const parsedProperties = job.parsed_properties as any[] || []
                const expectedPSNs = parsedProperties.map((p: any) => p.psn)

                send({
                    status: `Processing ${files.length} images...`,
                    total: files.length,
                    expected_psns: expectedPSNs.length,
                })

                // Categorize images by PSN
                const imagesByPSN: Record<string, any[]> = {}
                const orphanedImages: any[] = []
                const invalidFiles: string[] = []

                for (const file of files) {
                    // Get relative path from webkitRelativePath
                    const relativePath = file.webkitRelativePath || file.name
                    const psn = extractPSNFromPath(relativePath)

                    if (!psn) {
                        invalidFiles.push(file.name)
                        continue
                    }

                    const imageInfo = {
                        filename: file.name,
                        original_path: relativePath,
                        extracted_psn: psn,
                        file_size: file.size,
                        mime_type: file.type,
                    }

                    if (expectedPSNs.includes(psn)) {
                        if (!imagesByPSN[psn]) imagesByPSN[psn] = []
                        imagesByPSN[psn].push({ ...imageInfo, file })
                    } else {
                        orphanedImages.push(imageInfo)
                    }
                }

                send({
                    status: `Matched ${Object.keys(imagesByPSN).length} PSNs, ${orphanedImages.length} orphaned`,
                    matched_psns: Object.keys(imagesByPSN).length,
                    orphaned_count: orphanedImages.length,
                    progress: 10,
                })

                // Upload images to storage
                const uploadedImages: Record<string, any[]> = {}
                const totalImages = files.length - invalidFiles.length - orphanedImages.length
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

                send({
                    status: "Images uploaded successfully",
                    progress: 100,
                    total_images: processedCount,
                    failed_uploads: failedCount,
                    orphaned_images: orphanedImages.length,
                    matched_psns: Object.keys(uploadedImages).length,
                    unmatched_psns: expectedPSNs.filter(psn => !uploadedImages[psn]),
                    failed_files: failedUploads,
                    invalid_files: invalidFiles,
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
