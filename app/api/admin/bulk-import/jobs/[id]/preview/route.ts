import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"

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
        console.log(`[Preview API] Getting preview for job ${jobId}`)

        // Auth check
        const supabase = await createClient()
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !authUser) {
            console.log(`[Preview API] Unauthorized request`)
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
            console.log(`[Preview API] Job not found: ${jobId}`)
            return NextResponse.json({ error: "Job not found" }, { status: 404 })
        }

        console.log(`[Preview API] Job found: ${job.id}, status: ${job.status}`)

        // Parse data
        const properties = (job.parsed_properties as any[]) || []
        const imagesByPSN = (job.images_by_psn as Record<string, any[]>) || {}
        const orphanedImages = (job.orphaned_images as any[]) || []
        const newOwners = (job.new_owners as any[]) || []

        console.log(`[Preview API] Data parsed:`, {
            properties_count: properties.length,
            images_by_psn_keys: Object.keys(imagesByPSN),
            orphaned_count: orphanedImages.length,
            new_owners_count: newOwners.length,
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
                images: images.map((img: any) => img.filename || img),
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

        console.log(`[Preview API] Response prepared successfully`)
        return NextResponse.json(response)
    } catch (error: any) {
        console.error("[Preview API] Error:", error)
        return NextResponse.json(
            { error: error.message || "Failed to get preview" },
            { status: 500 }
        )
    }
}
