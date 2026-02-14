import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: Record<string, unknown>) => {
                controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))
            }

            try {
                // 1. AUTH CHECK
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

                // 2. GET PARAMETERS
                const body = await request.json()
                const { idColumn = 'psn', specificPsn } = body

                // Validate idColumn to prevent injection
                const VALID_ID_COLUMNS = ['psn', 'id', 'property_id']
                const validatedIdColumn = VALID_ID_COLUMNS.includes(idColumn?.toLowerCase())
                    ? idColumn.toLowerCase()
                    : 'psn'

                send({ status: 'Fetching staged images...' })

                // 3. FETCH PENDING STAGED IMAGES
                let query = supabaseAdmin
                    .from('image_staging')
                    .select('*')
                    .eq('admin_id', authUser.id)
                    .eq('status', 'pending')

                // If specific PSN provided, filter by it
                if (specificPsn) {
                    query = query.eq('extracted_psn', specificPsn)
                }

                const { data: stagedImages, error: fetchError } = await query

                if (fetchError) {
                    console.error('Fetch staged images error:', fetchError)
                    throw new Error('Failed to fetch staged images')
                }

                if (!stagedImages || stagedImages.length === 0) {
                    send({ error: 'No pending images found to assign', type: 'NO_IMAGES' })
                    controller.close()
                    return
                }

                const total = stagedImages.length
                send({ status: `Found ${total} images to assign...`, total })

                // 4. GROUP BY PSN
                const imagesByPsn = new Map<string, typeof stagedImages>()
                for (const img of stagedImages) {
                    if (!imagesByPsn.has(img.extracted_psn)) {
                        imagesByPsn.set(img.extracted_psn, [])
                    }
                    imagesByPsn.get(img.extracted_psn)!.push(img)
                }

                const uniquePsns = Array.from(imagesByPsn.keys())
                send({
                    status: `Found images for ${uniquePsns.length} unique property IDs...`,
                    uniqueProperties: uniquePsns.length
                })

                // 5. FIND MATCHING PROPERTIES
                const { data: properties, error: propError } = await supabaseAdmin
                    .from('properties')
                    .select('id, psn, title, images')
                    .in('psn', uniquePsns)

                if (propError) {
                    console.error('Fetch properties error:', propError)
                    throw new Error('Failed to fetch properties')
                }

                // Create map of PSN -> property
                const propertyMap = new Map(
                    properties?.map(p => [String(p.psn), p]) || []
                )

                send({
                    status: `Matched ${propertyMap.size} properties in database...`,
                    matchedProperties: propertyMap.size,
                    orphanedPsns: uniquePsns.length - propertyMap.size
                })

                // 6. PROCESS ASSIGNMENT
                let success = 0
                let failed = 0
                let orphaned = 0
                const errors: string[] = []
                let processed = 0

                for (const [psn, images] of imagesByPsn) {
                    const property = propertyMap.get(psn)

                    // If no matching property, mark as orphaned
                    if (!property) {
                        for (const img of images) {
                            const { error: orphanError } = await supabaseAdmin
                                .from('image_staging')
                                .update({
                                    status: 'orphaned',
                                    error_message: `No property found with ${validatedIdColumn} = ${psn}`
                                })
                                .eq('id', img.id)
                            if (orphanError) {
                                console.error(`Failed to mark image ${img.id} as orphaned:`, orphanError)
                            }
                        }
                        orphaned += images.length
                        processed += images.length
                        continue
                    }

                    // Process each image for this property
                    const propertyImageUrls: string[] = []

                    for (const img of images) {
                        try {
                            // Generate final filename
                            const fileExt = img.file_name.split('.').pop() || 'jpg'
                            const timestamp = Date.now()
                            const random = Math.random().toString(36).substring(7)
                            const newFileName = `${timestamp}-${random}.${fileExt}`
                            const newPath = `${property.id}/${newFileName}`

                            // Download from staging
                            const { data: stagingData, error: downloadError } = await supabaseAdmin.storage
                                .from('property-images-staging')
                                .download(img.storage_path)

                            if (downloadError) {
                                console.error('Download from staging error:', downloadError)
                                throw new Error('Failed to download from staging')
                            }

                            // Upload to final bucket
                            const { error: uploadError } = await supabaseAdmin.storage
                                .from('property-images')
                                .upload(newPath, stagingData, {
                                    cacheControl: '3600',
                                    upsert: false,
                                    contentType: img.mime_type || 'image/jpeg'
                                })

                            if (uploadError) {
                                console.error('Upload to final bucket error:', uploadError)
                                throw new Error('Failed to upload to final bucket')
                            }

                            // Get public URL
                            const { data: { publicUrl } } = supabaseAdmin.storage
                                .from('property-images')
                                .getPublicUrl(newPath)

                            propertyImageUrls.push(publicUrl)

                            // Update staging record
                            const { error: updateError } = await supabaseAdmin
                                .from('image_staging')
                                .update({
                                    status: 'assigned',
                                    property_id: property.id,
                                    assigned_at: new Date().toISOString(),
                                    error_message: null
                                })
                                .eq('id', img.id)

                            if (updateError) {
                                console.error('Update staging record error:', updateError)
                                throw new Error('Failed to update staging record')
                            }

                            // Delete from staging storage (best effort - don't fail if this errors)
                            try {
                                await supabaseAdmin.storage
                                    .from('property-images-staging')
                                    .remove([img.storage_path])
                            } catch (cleanupError) {
                                console.error('Failed to cleanup staging storage:', cleanupError)
                            }

                            success++
                        } catch (error) {
                            const errorMsg = error instanceof Error ? error.message : 'Unknown error'
                            // Log full error server-side
                            console.error(`Error processing image ${img.original_name}:`, error)
                            // Send sanitized error to client
                            errors.push(`${img.original_name}: Processing failed`)

                            // Update staging record with error
                            try {
                                await supabaseAdmin
                                    .from('image_staging')
                                    .update({
                                        status: 'failed',
                                        error_message: 'Processing failed'
                                    })
                                    .eq('id', img.id)
                            } catch (updateError) {
                                console.error('Failed to update staging record with error:', updateError)
                            }

                            failed++
                        }

                        processed++
                    }

                    // Update property with new images
                    if (propertyImageUrls.length > 0) {
                        const existingImages = (property as { images?: string[] }).images || []
                        const updatedImages = [...existingImages, ...propertyImageUrls]

                        const { error: propUpdateError } = await supabaseAdmin
                            .from('properties')
                            .update({ images: updatedImages })
                            .eq('id', (property as { id: string }).id)

                        if (propUpdateError) {
                            console.error(`Property ${psn} update error:`, propUpdateError)
                            errors.push(`Property ${psn}: Failed to update property record`)
                        }
                    }

                    // Send progress
                    const progress = Math.round((processed / total) * 100)
                    send({
                        progress,
                        processed,
                        total,
                        success,
                        failed,
                        orphaned,
                        currentPsn: psn
                    })
                }

                // 7. SEND FINAL RESULTS
                send({
                    results: {
                        total,
                        success,
                        failed,
                        orphaned,
                        matchedProperties: propertyMap.size,
                        totalUniquePsns: uniquePsns.length,
                        errors: errors.slice(0, 50)
                    }
                })

                controller.close()
            } catch (error) {
                console.error('Assignment error:', error)
                send({ error: 'Assignment failed. Please try again.' })
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
