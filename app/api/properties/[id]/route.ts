import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { csrfProtection } from '@/lib/csrf-server'
import { createHash } from 'crypto'

// In-memory store for idempotency keys (use Redis in production)
const idempotencyStore = new Map<string, { response: unknown; timestamp: number }>()

// Cleanup old idempotency keys every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    const EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours
    for (const [key, record] of idempotencyStore.entries()) {
      if (now - record.timestamp > EXPIRY_MS) {
        idempotencyStore.delete(key)
      }
    }
  }, 600000) // 10 minutes
}

/**
 * Generate ETag for property data
 */
function generateETag(data: Record<string, unknown>): string {
  const hash = createHash('md5').update(JSON.stringify(data)).digest('hex')
  return `"${hash}"`
}

/**
 * Compare two objects to determine if they are deeply equal
 */
function isDeepEqual(obj1: unknown, obj2: unknown): boolean {
  if (obj1 === obj2) return true
  if (typeof obj1 !== typeof obj2) return false
  if (typeof obj1 !== 'object' || obj1 === null || obj2 === null) return false

  const keys1 = Object.keys(obj1 as Record<string, unknown>)
  const keys2 = Object.keys(obj2 as Record<string, unknown>)

  if (keys1.length !== keys2.length) return false

  for (const key of keys1) {
    if (!keys2.includes(key)) return false
    const val1 = (obj1 as Record<string, unknown>)[key]
    const val2 = (obj2 as Record<string, unknown>)[key]

    if (Array.isArray(val1) && Array.isArray(val2)) {
      if (val1.length !== val2.length) return false
      for (let i = 0; i < val1.length; i++) {
        if (!isDeepEqual(val1[i], val2[i])) return false
      }
    } else if (typeof val1 === 'object' && val1 !== null) {
      if (!isDeepEqual(val1, val2)) return false
    } else if (val1 !== val2) {
      return false
    }
  }

  return true
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch property' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    // Generate ETag for the response
    const etag = generateETag(data)

    // Check for If-None-Match header for conditional GET
    const ifNoneMatch = request.headers.get('if-none-match')
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } })
    }

    // Track view with deduplication and rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
               request.headers.get('x-real-ip') ??
               'unknown'
    const viewKey = `property:view:${ip}:${id}`

    // Rate limit: 1 view per IP per property per hour
    const viewRateLimit = await rateLimit(viewKey, 1, 60 * 60 * 1000)

    if (viewRateLimit.success) {
      // Use atomic increment RPC to avoid race conditions
      await supabase.rpc('increment_property_views', { property_id: id })
    }

    return NextResponse.json({ data }, { headers: { ETag: etag } })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch property' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // CSRF Protection
    const csrfCheck = await csrfProtection(request)
    if (!csrfCheck.valid) {
      return NextResponse.json({ error: csrfCheck.error || 'Invalid request' }, { status: 403 })
    }

    const { id } = await params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
    }

    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limiting: 20 property updates per hour per user
    const rateLimitKey = `property:update:${user.id}`
    const rateLimitResult = await rateLimit(rateLimitKey, 20, 60 * 60 * 1000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    const supabase = await createClient()

    // Fetch current property data for ownership check and comparison
    const { data: property, error: fetchError } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) {
      return NextResponse.json({ error: 'Failed to fetch property' }, { status: 500 })
    }

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    if (property.owner_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check for If-Match header (ETag validation for optimistic locking)
    const ifMatch = request.headers.get('if-match')
    if (ifMatch) {
      const currentETag = generateETag(property)
      if (ifMatch !== currentETag && ifMatch !== '*') {
        return NextResponse.json(
          { error: 'Conflict: Property has been modified. Please refresh and try again.' },
          { status: 412 }
        )
      }
    }

    const body = await request.json()

    // Check for idempotency key
    const idempotencyKey = request.headers.get('idempotency-key')
    if (idempotencyKey) {
      const idempotencyId = `${user.id}:${id}:${idempotencyKey}`
      const cached = idempotencyStore.get(idempotencyId)
      if (cached) {
        // Return cached response for duplicate request
        return NextResponse.json(cached.response, {
          headers: {
            'X-Idempotency-Replay': 'true',
            'ETag': generateETag((cached.response as { data?: Record<string, unknown> }).data || {})
          }
        })
      }
    }

    // Prevent updating sensitive fields
    const allowedFields = [
      'title', 'description', 'price', 'availability', 'property_type',
      'room_type', 'city', 'area', 'locality', 'amenities', 'images',
      'house_rules', 'furnishing_status', 'private_room_price',
      'double_sharing_price', 'triple_sharing_price'
    ]
    const sanitizedBody: Record<string, unknown> = {}
    for (const key of allowedFields) {
      if (key in body) {
        sanitizedBody[key] = body[key]
      }
    }

    // Compare values before updating - skip if no changes
    const hasChanges = Object.keys(sanitizedBody).some(key => {
      return !isDeepEqual(sanitizedBody[key], property[key])
    })

    if (!hasChanges) {
      // No changes detected - return current data without updating
      const response = {
        data: property,
        meta: {
          idempotent: true,
          changed: false,
          message: 'No changes detected'
        }
      }

      // Cache response if idempotency key provided
      if (idempotencyKey) {
        const idempotencyId = `${user.id}:${id}:${idempotencyKey}`
        idempotencyStore.set(idempotencyId, { response, timestamp: Date.now() })
      }

      return NextResponse.json(response, {
        headers: {
          'ETag': generateETag(property)
        }
      })
    }

    // Perform the update
    const { data, error } = await supabase
      .from('properties')
      .update(sanitizedBody)
      .eq('id', id)
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: 'Failed to update property' }, { status: 500 })
    }

    const response = {
      data,
      meta: {
        idempotent: false,
        changed: true
      }
    }

    // Cache response if idempotency key provided
    if (idempotencyKey) {
      const idempotencyId = `${user.id}:${id}:${idempotencyKey}`
      idempotencyStore.set(idempotencyId, { response, timestamp: Date.now() })
    }

    return NextResponse.json(response, {
      headers: {
        'ETag': generateETag(data || {})
      }
    })
  } catch {
    return NextResponse.json({ error: 'Failed to update property' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
    }

    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limiting: 10 property deletions per hour per user
    const rateLimitKey = `property:delete:${user.id}`
    const rateLimitResult = await rateLimit(rateLimitKey, 10, 60 * 60 * 1000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    const supabase = await createClient()

    const { data: property, error: fetchError } = await supabase
      .from('properties')
      .select('owner_id, images')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) {
      return NextResponse.json({ error: 'Failed to fetch property' }, { status: 500 })
    }

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    if (property.owner_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete from database first, then clean up storage
    const { error: deleteError } = await supabase.from('properties').delete().eq('id', id)

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to delete property' }, { status: 500 })
    }

    // Clean up storage after successful database delete (best effort)
    if (property.images && property.images.length > 0) {
      try {
        const filePaths = property.images.map((url: string) => {
          const parts = url.split('/property-images/')
          return parts[1]
        }).filter(Boolean)

        if (filePaths.length > 0) {
          const { error: storageError } = await supabase.storage.from('property-images').remove(filePaths)
          if (storageError) {
            // Don't fail the request - property is already deleted
          }
        }
      } catch {
        // Don't fail the request - property is already deleted
      }
    }

    return NextResponse.json({ message: 'Property deleted successfully' })
  } catch {
    return NextResponse.json({ error: 'Failed to delete property' }, { status: 500 })
  }
}


