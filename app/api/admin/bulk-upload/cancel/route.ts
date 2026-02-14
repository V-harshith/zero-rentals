import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
    try {
        // Auth check
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: profile } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle()

        if (!profile || profile.role !== 'admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
        }

        const { uploadId } = await request.json()

        if (!uploadId) {
            return NextResponse.json({ error: 'Upload ID required' }, { status: 400 })
        }

        // Update status to cancelled
        const { error } = await supabaseAdmin
            .from('bulk_uploads')
            .update({
                status: 'cancelled',
                completed_at: new Date().toISOString(),
            })
            .eq('id', uploadId)
            .eq('status', 'processing')

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Cancel failed'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
