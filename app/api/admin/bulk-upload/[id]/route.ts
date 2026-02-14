import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"

interface CredentialRecord {
    email: string
    password: string
    name: string
    phone: string
    properties: string[]
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params

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

        // Fetch upload record
        const { data: upload, error } = await supabaseAdmin
            .from('bulk_uploads')
            .select('id, file_name, credentials, status, total_rows, success_count, failed_count, errors, new_owners_count, created_at, completed_at')
            .eq('id', id)
            .single()

        if (error || !upload) {
            return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
        }

        const format = request.nextUrl.searchParams.get('format')

        // CSV download
        if (format === 'csv') {
            const credentials = (upload.credentials || []) as CredentialRecord[]

            if (credentials.length === 0) {
                return NextResponse.json({ error: 'No credentials available for this upload' }, { status: 404 })
            }

            const csvRows = [
                'Owner Email,Password,Owner Name,Phone,Properties,Login URL'
            ]
            for (const cred of credentials) {
                csvRows.push([
                    cred.email,
                    cred.password,
                    `"${(cred.name || '').replace(/"/g, '""')}"`,
                    cred.phone || '',
                    `"${(cred.properties || []).join('; ')}"`,
                    'https://zerorentals.com/login/owner'
                ].join(','))
            }

            return new Response(csvRows.join('\n'), {
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': `attachment; filename="credentials_${upload.file_name.replace(/\.[^.]+$/, '')}_${new Date(upload.created_at).toISOString().split('T')[0]}.csv"`,
                },
            })
        }

        // JSON detail response
        return NextResponse.json({
            upload: {
                id: upload.id,
                file_name: upload.file_name,
                status: upload.status,
                total_rows: upload.total_rows,
                success_count: upload.success_count,
                failed_count: upload.failed_count,
                new_owners_count: upload.new_owners_count,
                errors: upload.errors || [],
                credentials_count: ((upload.credentials || []) as CredentialRecord[]).length,
                created_at: upload.created_at,
                completed_at: upload.completed_at,
            }
        })
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Failed to fetch upload details'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
