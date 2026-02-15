import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Increase body size limit for image uploads (prevents 413 Payload Too Large)
export const bodyParser = {
  sizeLimit: '10mb',
}

// Security: Allowed file types
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_FILES_PER_BATCH = 100

// Extract file extension securely (prevents path traversal)
function getSafeExtension(filename: string): string | null {
    const lastDotIndex = filename.lastIndexOf('.')
    if (lastDotIndex === -1 || lastDotIndex === 0) return null
    const ext = filename.slice(lastDotIndex + 1).toLowerCase()
    return ALLOWED_EXTENSIONS.includes(ext) ? ext : null
}

// Validate MIME type
function validateMimeType(mimeType: string): boolean {
    return ALLOWED_MIME_TYPES.includes(mimeType?.toLowerCase())
}

// Extract property ID from filename
function extractPropertyId(filename: string): string | null {
    // Remove file extension
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "")

    // Try different patterns
    const patterns = [
        /^(\d+)$/,                    // 155.jpg → 155
        /^(\d+)-\d+$/,                // 155-1.jpg → 155
        /^PSN-?(\d+)/i,               // PSN-155.jpg or PSN155.jpg → 155
        /property[-_]?(\d+)/i,        // property_155.jpg → 155
        /^[a-z]*[-_]?(\d+)/i,         // any_155.jpg → 155
    ]

    for (const pattern of patterns) {
        const match = nameWithoutExt.match(pattern)
        if (match) {
            return match[1]
        }
    }

    return null
}

export async function POST(request: NextRequest) {
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: Record<string, unknown>) => {
                controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))
            }

            try {
                // 1. AUTH CHECK - Verify admin
                const supabase = await createClient()
                const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

                if (authError || !authUser) {
                    send({ error: 'Unauthorized: Please log in as admin' })
                    controller.close()
                    return
                }

                const { data: profile } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', authUser.id)
                    .maybeSingle()

                if (!profile || profile.role !== 'admin') {
                    send({ error: 'Unauthorized: Admin access required' })
                    controller.close()
                    return
                }

                // 2. PARSE REQUEST
                const formData = await request.formData()
                const images = formData.getAll('images') as File[]
                const idColumn = formData.get('idColumn') as string || 'PSN'
                const uploadBatchId = formData.get('uploadBatchId') as string || null

                if (images.length === 0) {
                    send({ error: 'No images provided' })
                    controller.close()
                    return
                }

                // Validate batch size
                if (images.length > MAX_FILES_PER_BATCH) {
                    send({ error: `Maximum ${MAX_FILES_PER_BATCH} files allowed per batch` })
                    controller.close()
                    return
                }

                const total = images.length
                let success = 0
                let failed = 0
                const errors: string[] = []
                const stagedImages: Array<{
                    id: string
                    fileName: string
                    extractedPsn: string
                    storagePath: string
                }> = []

                send({ status: `Processing ${total} images...`, total })

                // 3. STAGE EACH IMAGE
                let processed = 0
                for (const image of images) {
                    try {
                        // Validate file size
                        if (image.size > MAX_FILE_SIZE) {
                            errors.push(`${image.name}: File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`)
                            failed++
                            processed++
                            continue
                        }

                        // Validate file type
                        const fileExt = getSafeExtension(image.name)
                        if (!fileExt || !validateMimeType(image.type)) {
                            errors.push(`${image.name}: Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`)
                            failed++
                            processed++
                            continue
                        }

                        const extractedPsn = extractPropertyId(image.name)

                        if (!extractedPsn) {
                            errors.push(`${image.name}: Could not extract property ID from filename`)
                            failed++
                            processed++
                            continue
                        }

                        // Generate unique filename
                        const timestamp = Date.now()
                        const random = Math.random().toString(36).substring(7)
                        const fileName = `${timestamp}-${random}.${fileExt}`
                        const storagePath = `${authUser.id}/${fileName}`

                        // Upload to STAGING bucket
                        const { error: uploadError } = await supabaseAdmin.storage
                            .from('property-images-staging')
                            .upload(storagePath, image, {
                                cacheControl: '3600',
                                upsert: false,
                                contentType: image.type || `image/${fileExt}`
                            })

                        if (uploadError) {
                            console.error('Storage upload error:', uploadError)
                            throw new Error('Storage upload failed')
                        }

                        // Insert into image_staging table
                        const { data: stagedRecord, error: dbError } = await supabaseAdmin
                            .from('image_staging')
                            .insert({
                                admin_id: authUser.id,
                                upload_batch_id: uploadBatchId,
                                file_name: fileName,
                                original_name: image.name,
                                extracted_psn: extractedPsn,
                                storage_path: storagePath,
                                file_size: image.size,
                                mime_type: image.type,
                                status: 'pending'
                            })
                            .select('id, file_name, extracted_psn, storage_path')
                            .single()

                        if (dbError) {
                            // Rollback storage upload (best effort)
                            try {
                                await supabaseAdmin.storage
                                    .from('property-images-staging')
                                    .remove([storagePath])
                            } catch (cleanupError) {
                                console.error('Failed to cleanup storage after DB error:', cleanupError)
                            }
                            console.error('Database insert error:', dbError)
                            throw new Error('Database update failed')
                        }

                        if (stagedRecord) {
                            stagedImages.push({
                                id: stagedRecord.id,
                                fileName: image.name,
                                extractedPsn: extractedPsn,
                                storagePath: storagePath
                            })
                        }

                        success++
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
                        // Log full error server-side only
                        console.error(`Upload error for ${image.name}:`, error)
                        // Send sanitized error to client
                        errors.push(`${image.name}: Upload failed`)
                        failed++
                    }

                    processed++

                    // Send progress update
                    const progress = Math.round((processed / total) * 100)
                    send({
                        progress,
                        processed,
                        total,
                        success,
                        failed
                    })
                }

                // 4. GROUP STAGED IMAGES BY PSN FOR SUMMARY
                const imagesByPsn = new Map<string, number>()
                for (const img of stagedImages) {
                    imagesByPsn.set(img.extractedPsn, (imagesByPsn.get(img.extractedPsn) || 0) + 1)
                }

                // Send final results
                send({
                    results: {
                        total,
                        success,
                        failed,
                        errors: errors.slice(0, 50),
                        stagedCount: stagedImages.length,
                        imagesByPsn: Object.fromEntries(imagesByPsn),
                        nextStep: 'Review staged images and click "Assign to Properties" to match with database'
                    }
                })

                controller.close()
            } catch (error) {
                console.error('Bulk upload error:', error)
                const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred'
                send({ error: 'Upload failed. Please try again.' })
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

// GET endpoint to fetch staged images
export async function GET(request: NextRequest) {
    try {
        // Auth check
        const supabase = await createClient()
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !authUser) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: profile } = await supabase
            .from('users')
            .select('role')
            .eq('id', authUser.id)
            .maybeSingle()

        if (!profile || profile.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 })
        }

        // Get status filter from query params
        const { searchParams } = new URL(request.url)
        const status = searchParams.get('status') || 'pending'

        // Fetch staged images
        const { data: stagedImages, error } = await supabaseAdmin
            .from('image_staging')
            .select('*')
            .eq('admin_id', authUser.id)
            .eq('status', status)
            .order('created_at', { ascending: false })

        if (error) {
            throw error
        }

        // Get summary stats
        const { data: stats } = await supabaseAdmin
            .from('image_staging')
            .select('status')
            .eq('admin_id', authUser.id)

        const summary = {
            pending: stats?.filter(s => s.status === 'pending').length || 0,
            assigned: stats?.filter(s => s.status === 'assigned').length || 0,
            failed: stats?.filter(s => s.status === 'failed').length || 0,
            orphaned: stats?.filter(s => s.status === 'orphaned').length || 0,
            total: stats?.length || 0
        }

        return Response.json({
            images: stagedImages || [],
            summary
        })
    } catch (error: any) {
        return Response.json(
            { error: error.message || 'Failed to fetch staged images' },
            { status: 500 }
        )
    }
}
