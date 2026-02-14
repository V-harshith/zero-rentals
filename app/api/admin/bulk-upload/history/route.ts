import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"

export async function GET() {
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

        // Fetch upload history (last 20)
        const { data: uploads, error } = await supabaseAdmin
            .from('bulk_uploads')
            .select('id, file_name, total_rows, success_count, failed_count, status, new_owners_count, created_at, completed_at')
            .order('created_at', { ascending: false })
            .limit(20)

        if (error) {
            throw error
        }

        return NextResponse.json({ uploads: uploads || [] })
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Failed to fetch history'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
