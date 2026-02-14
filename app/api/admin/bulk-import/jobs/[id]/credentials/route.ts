import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"

// ============================================================================
// GET /api/admin/bulk-import/jobs/[id]/credentials
// Download credentials CSV
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

        // Get job
        const { data: job, error: jobError } = await supabaseAdmin
            .from("bulk_import_jobs")
            .select("id, admin_id, status, credentials_encrypted, new_owners, created_at")
            .eq("id", jobId)
            .single()

        if (jobError || !job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 })
        }

        if (job.admin_id !== authUser.id) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 })
        }

        // Parse credentials
        let credentials: any[] = []

        if (job.credentials_encrypted) {
            try {
                const decrypted = Buffer.from(job.credentials_encrypted, 'base64').toString()
                credentials = JSON.parse(decrypted)
            } catch (e) {
                console.error("Failed to decrypt credentials:", e)
            }
        }

        // Also include new owners data for additional context
        const newOwners = job.new_owners as any[] || []

        // Build CSV
        const csvRows = [
            ['Email', 'Password', 'Name', 'Phone', 'Properties', 'Login URL', 'Created At'].join(',')
        ]

        for (let i = 0; i < credentials.length; i++) {
            const cred = credentials[i]
            const ownerInfo = newOwners.find(o => o.email === cred.email) || {}

            csvRows.push([
                cred.email,
                cred.password,
                `"${ownerInfo.name || ''}"`,
                ownerInfo.phone || '',
                `"${(ownerInfo.properties || []).join('; ')}"`,
                cred.login_url || 'https://zerorentals.com/login/owner',
                new Date(job.created_at).toISOString(),
            ].join(','))
        }

        const csv = csvRows.join('\n')

        // Return as downloadable file
        return new NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="owner_credentials_${jobId.slice(0, 8)}.csv"`,
            },
        })
    } catch (error: any) {
        console.error("Credentials download error:", error)
        return NextResponse.json(
            { error: error.message || "Failed to download credentials" },
            { status: 500 }
        )
    }
}
