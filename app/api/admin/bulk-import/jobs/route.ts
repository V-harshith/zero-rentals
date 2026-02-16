import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import {
    checkRateLimit,
    recordJobCreation,
    hasConcurrentProcessingJob,
} from "@/lib/bulk-import-queue"

// ============================================================================
// GET /api/admin/bulk-import/jobs
// List all jobs for the current admin
// ============================================================================
export async function GET(request: NextRequest) {
    try {
        // Auth check
        const supabase = await createClient()
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !authUser) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // Verify admin role
        const { data: profile } = await supabase
            .from("users")
            .select("role")
            .eq("id", authUser.id)
            .maybeSingle()

        if (!profile || profile.role !== "admin") {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 })
        }

        // Get recent jobs (last 30 days)
        const { data: jobs, error } = await supabaseAdmin
            .from("bulk_import_jobs")
            .select("id, status, step, excel_file_name, total_properties, total_images, processed_properties, failed_properties, new_owners, created_at, completed_at")
            .eq("admin_id", authUser.id)
            .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .order("created_at", { ascending: false })
            .limit(50)

        if (error) {
            console.error("Error fetching jobs:", error)
            return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 })
        }

        return NextResponse.json({ jobs: jobs || [] })
    } catch (error) {
        console.error("Unexpected error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// ============================================================================
// POST /api/admin/bulk-import/jobs
// Create a new import job
// ============================================================================
export async function POST(request: NextRequest) {
    try {
        // Auth check
        const supabase = await createClient()
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !authUser) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // Verify admin role
        const { data: profile } = await supabase
            .from("users")
            .select("role")
            .eq("id", authUser.id)
            .maybeSingle()

        if (!profile || profile.role !== "admin") {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 })
        }

        // Check rate limiting (max 3 new jobs per minute per admin)
        const rateLimitCheck = await checkRateLimit(authUser.id)
        if (!rateLimitCheck.canProceed) {
            return NextResponse.json(
                {
                    error: rateLimitCheck.reason,
                    retryAfterSeconds: rateLimitCheck.estimatedWaitSeconds,
                },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(rateLimitCheck.estimatedWaitSeconds || 60),
                    },
                }
            )
        }

        // Check for concurrent processing job
        const hasConcurrent = await hasConcurrentProcessingJob(authUser.id)
        if (hasConcurrent) {
            return NextResponse.json(
                { error: "You have an import job currently being processed. Please wait for it to complete before starting a new one." },
                { status: 429 }
            )
        }

        // Check for active job limit (max 5 concurrent jobs per admin)
        const { count: activeJobs } = await supabaseAdmin
            .from("bulk_import_jobs")
            .select("*", { count: "exact", head: true })
            .eq("admin_id", authUser.id)
            .in("status", ["created", "parsing_excel", "excel_parsed", "uploading_images", "images_uploaded", "ready", "processing"])

        if (activeJobs && activeJobs >= 5) {
            return NextResponse.json(
                { error: "You have too many active import jobs. Please complete or cancel existing jobs before creating a new one." },
                { status: 429 }
            )
        }

        // Create new job
        const { data: job, error } = await supabaseAdmin
            .from("bulk_import_jobs")
            .insert({
                admin_id: authUser.id,
                status: "created",
                step: "created",
            })
            .select("id, status, step, created_at")
            .single()

        if (error) {
            console.error("Error creating job:", error)
            return NextResponse.json({ error: "Failed to create import job" }, { status: 500 })
        }

        // Record job creation for rate limiting
        recordJobCreation(authUser.id)

        // Log audit
        await supabaseAdmin.from("bulk_import_audit_log").insert({
            job_id: job.id,
            admin_id: authUser.id,
            action: "job_created",
            details: {},
        })

        return NextResponse.json({ job })
    } catch (error) {
        console.error("Unexpected error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
