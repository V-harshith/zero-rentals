import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'

// Maximum number of users to export (prevent OOM)
const MAX_EXPORT_LIMIT = 10000

export async function POST(request: NextRequest) {
  try {
    // CSRF Protection
    const csrfCheck = await csrfProtection(request)
    if (!csrfCheck.valid) {
      return NextResponse.json({ error: csrfCheck.error || 'Invalid request' }, { status: 403 })
    }

    // Rate limiting: 10 exports per hour per admin
    const rateLimitKey = `admin:export:users:${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'}`
    const rateLimitResult = await rateLimit(rateLimitKey, 10, 60 * 60 * 1000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    const supabase = await createClient()

    // Get authenticated user
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 })
    }

    // Get user profile with role
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', authUser.id)
      .single()

    if (profileError || !userProfile || userProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { role, format = 'json', fromDate, toDate } = body

    // Validate date parameters
    if (fromDate && !isValidDate(fromDate)) {
      return NextResponse.json({ error: 'Invalid fromDate format' }, { status: 400 })
    }
    if (toDate && !isValidDate(toDate)) {
      return NextResponse.json({ error: 'Invalid toDate format' }, { status: 400 })
    }

    let query = supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(MAX_EXPORT_LIMIT)

    if (role && role !== 'all') {
      query = query.eq('role', role)
    }

    // Date range filtering
    if (fromDate) {
      query = query.gte('created_at', fromDate)
    }
    if (toDate) {
      // Add one day to include the entire end date
      const endDate = new Date(toDate)
      endDate.setDate(endDate.getDate() + 1)
      query = query.lt('created_at', endDate.toISOString())
    }

    const { data, error } = await query

    if (error) {
      console.error('Export error:', error)
      return NextResponse.json({ error: 'Failed to export users' }, { status: 500 })
    }

    if (format === 'csv') {
      const csv = convertToCSV(data || [])
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="users-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      })
    } else {
      return NextResponse.json({ data })
    }
  } catch (error) {
    console.error('Error exporting users:', error)
    return NextResponse.json({ error: 'Failed to export users' }, { status: 500 })
  }
}

/**
 * Validates date string format (YYYY-MM-DD)
 */
function isValidDate(dateStr: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/
  if (!regex.test(dateStr)) return false
  const date = new Date(dateStr)
  return !isNaN(date.getTime())
}

/**
 * Sanitizes CSV cell to prevent CSV injection attacks
 * Prefixes dangerous characters that could be interpreted as formulas
 */
function sanitizeCSVCell(cell: unknown): string {
  if (cell === null || cell === undefined) return ''
  const str = String(cell)
  // Prefix cells starting with formula-triggering characters
  if (/^[=+\-@\t\r\n]/.test(str)) {
    return "'" + str
  }
  return str
}

/**
 * Escapes CSV cell value by wrapping in quotes and escaping existing quotes
 */
function escapeCSVCell(cell: unknown): string {
  const sanitized = sanitizeCSVCell(cell)
  // Wrap in quotes and escape existing quotes
  return `"${sanitized.replace(/"/g, '""')}"`
}

function convertToCSV(data: Record<string, unknown>[]): string {
  if (!data || data.length === 0) return ''

  const headers = ['ID', 'Name', 'Email', 'Phone', 'Role', 'Status', 'Verified', 'Preferred City', 'Preferred Area', 'Created At']
  const rows = data.map(user => [
    user.id,
    user.name,
    user.email,
    user.phone || '',
    user.role,
    user.status,
    user.verified ? 'Yes' : 'No',
    user.preferred_city || '',
    user.preferred_area || '',
    user.created_at ? new Date(String(user.created_at)).toLocaleDateString() : '',
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(escapeCSVCell).join(',')),
  ].join('\n')

  return csvContent
}
