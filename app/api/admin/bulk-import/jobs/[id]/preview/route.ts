import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { logger } from "@/lib/bulk-import/logger"

// ============================================================================
// GET /api/admin/bulk-import/jobs/[id]/preview
// Get preview data for review step
// ============================================================================
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: jobId } = await params
        logger.start('Getting preview for job', { jobId })

        // Auth check
        const supabase = await createClient()
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !authUser) {
            logger.warn('Unauthorized preview request')
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // Get job
        const { data: job, error: jobError } = await supabaseAdmin
            .from("bulk_import_jobs")
            .select("*")
            .eq("id", jobId)
            .eq("admin_id", authUser.id)
            .single()

        if (jobError || !job) {
            logger.warn('Job not found', { jobId, error: jobError?.message })
            return NextResponse.json({ error: "Job not found" }, { status: 404 })
        }

        logger.info('Job found', { jobId, status: job.status })

        // Parse data
        const properties = (job.parsed_properties as Array<{
            row_number: number
            psn: string
            property_name: string
            owner_email: string
            owner_name: string
            property_data?: { city?: string; area?: string }
        }>) || []
        const rawImagesByPSN = (job.images_by_psn as Record<string, Array<{
            filename?: string
            storage_path?: string
            public_url?: string
        }>>) || {}
        const orphanedImages = (job.orphaned_images as Array<{
            filename?: string
        }>) || []
        const newOwners = (job.new_owners as Array<{
            email: string
            name: string
            phone: string
            properties?: string[]
        }>) || []

        // CRITICAL FIX: Normalize all images_by_psn keys to strings (PostgreSQL JSONB may coerce numeric strings)
        const imagesByPSN: Record<string, Array<{
            filename?: string
            storage_path?: string
            public_url?: string
        }>> = {}
        for (const [key, value] of Object.entries(rawImagesByPSN)) {
            imagesByPSN[String(key).trim()] = value
        }

        logger.info('Data parsed', {
            propertiesCount: properties.length,
            imagesByPSNKeys: Object.keys(imagesByPSN),
            orphanedCount: orphanedImages.length,
            newOwnersCount: newOwners.length,
        })

        // Build property preview
        const propertyPreviews = properties.map(prop => {
            // CRITICAL: Normalize PSN to string for lookup (Excel may parse as number)
            const psnKey = String(prop.psn)
            const images = imagesByPSN[psnKey] || []
            const isNewOwner = newOwners.some(o => o.email === prop.owner_email)

            return {
                row_number: prop.row_number,
                psn: prop.psn,
                property_name: prop.property_name,
                city: prop.property_data?.city,
                area: prop.property_data?.area,
                owner_email: prop.owner_email,
                owner_name: prop.owner_name,
                is_new_owner: isNewOwner,
                image_count: images.length,
                images: images.map((img) => img.filename || 'unknown'),
                has_images: images.length > 0,
            }
        })

        // Calculate summary
        const propertiesWithImages = propertyPreviews.filter(p => p.has_images).length
        const propertiesWithoutImages = propertyPreviews.filter(p => !p.has_images).length

        // Get list of PSNs without images
        const psnsWithoutImages = propertyPreviews
            .filter(p => !p.has_images)
            .map(p => p.psn)

        const response = {
            job_id: job.id,
            status: job.status,
            step: job.step,

            // Summary
            summary: {
                total_properties: properties.length,
                new_owners: newOwners.length,
                existing_owners_matched: job.existing_owners_matched || 0,
                total_images: job.total_images || 0,
                matched_images: Object.values(imagesByPSN).flat().length,
                properties_with_images: propertiesWithImages,
                properties_without_images: propertiesWithoutImages,
                orphaned_images: orphanedImages.length,
            },

            // Detailed data
            properties: propertyPreviews,
            psns_without_images: psnsWithoutImages,
            orphaned_images: orphanedImages,
            new_owners_preview: newOwners.map(o => ({
                email: o.email,
                name: o.name,
                phone: o.phone,
                properties: o.properties || [],
            })),
        }

        logger.complete('Preview response prepared', { jobId })
        return NextResponse.json(response)
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('Preview API error', { error: errorMessage })
        return NextResponse.json(
            { error: errorMessage || "Failed to get preview" },
            { status: 500 }
        )
    }
}
