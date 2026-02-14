import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"

// ============================================================================
// GET /api/admin/bulk-import/jobs/[id]
// Get job status and details
// ============================================================================
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const jobId = params.id

        // Auth check
        const supabase = await createClient()
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !authUser) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // Get job details
        const { data: job, error } = await supabaseAdmin
            .from("bulk_import_jobs")
            .select("*")
            .eq("id", jobId)
            .eq("admin_id", authUser.id)
            .single()

        if (error || !job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 })
        }

        // Get staged images count
        const { data: imageStats } = await supabaseAdmin
            .from("bulk_import_staged_images")
            .select("status")
            .eq("job_id", jobId)

        const imageCounts = {
            pending: imageStats?.filter(i => i.status === "pending").length || 0,
            uploaded: imageStats?.filter(i => i.status === "uploaded").length || 0,
            assigned: imageStats?.filter(i => i.status === "assigned").length || 0,
            failed: imageStats?.filter(i => i.status === "failed").length || 0,
            orphaned: imageStats?.filter(i => i.status === "orphaned").length || 0,
        }

        return NextResponse.json({
            job,
            imageStats: imageCounts,
        })
    } catch (error) {
        console.error("Unexpected error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// ============================================================================
// DELETE /api/admin/bulk-import/jobs/[id]
// Cancel and delete a job
// ============================================================================
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const jobId = params.id

        // Auth check
        const supabase = await createClient()
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !authUser) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // Get job
        const { data: job } = await supabaseAdmin
            .from("bulk_import_jobs")
            .select("status")
            .eq("id", jobId)
            .eq("admin_id", authUser.id)
            .single()

        if (!job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 })
        }

        // Can't delete jobs that are processing
        if (job.status === "processing") {
            return NextResponse.json(
                { error: "Cannot delete a job that is currently processing" },
                { status: 400 }
            )
        }

        // Delete staged images from storage
        const { data: stagedImages } = await supabaseAdmin
            .from("bulk_import_staged_images")
            .select("storage_path")
            .eq("job_id", jobId)

        if (stagedImages?.length) {
            const paths = stagedImages
                .map(i => i.storage_path)
                .filter(Boolean) as string[]

            if (paths.length) {
                await supabaseAdmin.storage
                    .from("property-images")
                    .remove(paths)
            }
        }

        // Delete staged images records
        await supabaseAdmin
            .from("bulk_import_staged_images")
            .delete()
            .eq("job_id", jobId)

        // Delete job
        await supabaseAdmin
            .from("bulk_import_jobs")
            .delete()
            .eq("id", jobId)

        // Log audit
        await supabaseAdmin.from("bulk_import_audit_log").insert({
            job_id: jobId,
            admin_id: authUser.id,
            action: "job_cancelled",
            details: { previous_status: job.status },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Unexpected error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
