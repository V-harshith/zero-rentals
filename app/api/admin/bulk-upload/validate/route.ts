import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { createClient } from "@/lib/supabase-server"

export const runtime = "nodejs"

const REQUIRED_COLUMNS = [
    'Property Name',
    'Owner Name',
    'Owner Contact',
    'City',
    'Area',
]

const OPTIONAL_COLUMNS = [
    'Country', 'Locality', 'Landmark', 'Address', 'Email',
    "PG's For", "PG's for",
    'USP', 'Facilities',
    'Private Room', 'Double Sharing', 'Triple Sharing', 'Four Sharing',
    'Deposit', 'Location', 'PSN',
]

interface ValidationResult {
    valid: boolean
    totalRows: number
    columns: string[]
    missingRequired: string[]
    warnings: string[]
    sampleRows: Record<string, unknown>[]
    ownerEmails: number
    ownerEmailsMissing: number
    priceErrors: number
}

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

        // Parse file
        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 })
        }

        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const data = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[]

        if (data.length === 0) {
            return NextResponse.json({
                valid: false,
                totalRows: 0,
                columns: [],
                missingRequired: [],
                warnings: ['Excel file is empty or has no data rows'],
                sampleRows: [],
                ownerEmails: 0,
                ownerEmailsMissing: 0,
                priceErrors: 0,
            } satisfies ValidationResult)
        }

        const columns = Object.keys(data[0])
        const missingRequired = REQUIRED_COLUMNS.filter(col => !columns.includes(col))
        const warnings: string[] = []

        // Check for unknown columns
        const knownColumns = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]
        const unknownColumns = columns.filter(col => !knownColumns.includes(col))
        if (unknownColumns.length > 0) {
            warnings.push(`Unknown columns will be ignored: ${unknownColumns.join(', ')}`)
        }

        // Validate rows
        let ownerEmails = 0
        let ownerEmailsMissing = 0
        let priceErrors = 0

        for (let i = 0; i < data.length; i++) {
            const row = data[i]

            // Check email
            const email = String(row['Email'] || '').trim()
            if (email && email.includes('@')) {
                ownerEmails++
            } else {
                ownerEmailsMissing++
            }

            // Check pricing - at least one price should exist
            const hasPrice = ['Private Room', 'Double Sharing', 'Triple Sharing', 'Four Sharing'].some(col => {
                const val = row[col]
                if (val === null || val === undefined || val === '' || val === 'None' || val === '-') return false
                const num = Number(val)
                return !isNaN(num) && num > 0
            })

            if (!hasPrice) {
                priceErrors++
                if (priceErrors <= 3) {
                    warnings.push(`Row ${i + 2}: No valid price found`)
                }
            }
        }

        if (priceErrors > 3) {
            warnings.push(`...and ${priceErrors - 3} more rows without valid prices`)
        }

        if (ownerEmailsMissing > 0) {
            warnings.push(`${ownerEmailsMissing} rows missing owner email — these properties won't have owner accounts`)
        }

        const result: ValidationResult = {
            valid: missingRequired.length === 0,
            totalRows: data.length,
            columns,
            missingRequired,
            warnings,
            sampleRows: data.slice(0, 3),
            ownerEmails,
            ownerEmailsMissing,
            priceErrors,
        }

        return NextResponse.json(result)
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Validation failed'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
