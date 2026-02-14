import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { csrfProtection } from '@/lib/csrf-server'

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

    return NextResponse.json({ data })
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

    const { data: property, error: fetchError } = await supabase
      .from('properties')
      .select('owner_id')
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

    const body = await request.json()

    // TODO: Add Zod schema validation for allowed fields
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

    const { data, error } = await supabase
      .from('properties')
      .update(sanitizedBody)
      .eq('id', id)
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: 'Failed to update property' }, { status: 500 })
    }

    return NextResponse.json({ data })
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


