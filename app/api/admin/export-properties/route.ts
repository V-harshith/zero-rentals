import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'

// Maximum number of properties to export (prevent OOM)
const MAX_EXPORT_LIMIT = 10000

export async function POST(request: NextRequest) {
  try {
    // CSRF Protection
    const csrfCheck = await csrfProtection(request)
    if (!csrfCheck.valid) {
      return NextResponse.json({ error: csrfCheck.error || 'Invalid request' }, { status: 403 })
    }

    // Rate limiting: 10 exports per hour per admin
    const rateLimitKey = `admin:export:properties:${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'}`
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
    const { format = 'csv', fromDate, toDate } = body

    // Validate date parameters
    if (fromDate && !isValidDate(fromDate)) {
      return NextResponse.json({ error: 'Invalid fromDate format' }, { status: 400 })
    }
    if (toDate && !isValidDate(toDate)) {
      return NextResponse.json({ error: 'Invalid toDate format' }, { status: 400 })
    }

    // Fetch all properties with owner details
    let query = supabase
      .from('properties')
      .select(`
        *,
        owner:users!properties_owner_id_fkey(email)
      `)
      .order('created_at', { ascending: false })
      .limit(MAX_EXPORT_LIMIT)

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
      return NextResponse.json({ error: 'Failed to export properties' }, { status: 500 })
    }

    if (format === 'csv') {
      const csv = convertToCSV(data || [])
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="properties-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      })
    } else {
      return NextResponse.json({ data })
    }
  } catch (error) {
    console.error('Error exporting properties:', error)
    return NextResponse.json({ error: 'Failed to export properties' }, { status: 500 })
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

interface PropertyRecord {
  id?: string
  title?: string
  description?: string
  property_type?: string
  room_type?: string
  city?: string
  area?: string
  locality?: string
  address?: string
  pincode?: string
  owner_name?: string
  owner_contact?: string
  owner?: { email?: string }
  private_room_price?: number
  double_sharing_price?: number
  triple_sharing_price?: number
  four_sharing_price?: number
  deposit?: string
  maintenance?: string
  furnishing?: string
  preferred_tenant?: string
  facilities?: string[]
  amenities?: string[]
  rules?: string[]
  views?: number
  featured?: boolean
  verified?: boolean
  status?: string
  created_at?: string
  updated_at?: string
}

function convertToCSV(data: PropertyRecord[]): string {
  if (!data || data.length === 0) return ''

  // Comprehensive headers including ALL property data
  const headers = [
    'ID',
    'Title',
    'Description',
    'Property Type',
    'Room Type',
    'City',
    'Area',
    'Locality',
    'Address',
    'Pincode',
    'Owner Name',
    'Owner Contact',
    'Owner Email',
    'Private Room Price',
    'Double Sharing Price',
    'Triple Sharing Price',
    'Four Sharing Price',
    'Deposit',
    'Maintenance',
    'Furnishing',
    'Preferred Tenant',
    'Facilities',
    'Amenities',
    'Rules',
    'Views',
    'Featured',
    'Verified',
    'Status',
    'Created At',
    'Updated At'
  ]

  const rows = data.map(property => [
    property.id,
    property.title,
    property.description,
    property.property_type,
    property.room_type,
    property.city,
    property.area,
    property.locality,
    property.address,
    property.pincode,
    property.owner_name,
    property.owner_contact,
    property.owner?.email,
    property.private_room_price,
    property.double_sharing_price,
    property.triple_sharing_price,
    property.four_sharing_price,
    property.deposit,
    property.maintenance,
    property.furnishing,
    property.preferred_tenant,
    Array.isArray(property.facilities) ? property.facilities.join('; ') : '',
    Array.isArray(property.amenities) ? property.amenities.join('; ') : '',
    Array.isArray(property.rules) ? property.rules.join('; ') : '',
    property.views,
    property.featured ? 'Yes' : 'No',
    property.verified ? 'Yes' : 'No',
    property.status,
    property.created_at ? new Date(property.created_at).toLocaleDateString() : '',
    property.updated_at ? new Date(property.updated_at).toLocaleDateString() : '',
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(escapeCSVCell).join(',')),
  ].join('\n')

  return csvContent
}
