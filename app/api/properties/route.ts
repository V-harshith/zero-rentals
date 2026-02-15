import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const location = searchParams.get('location')
    const propertyType = searchParams.get('propertyType')
    const roomType = searchParams.get('roomType')
    const minPrice = searchParams.get('minPrice')
    const maxPrice = searchParams.get('maxPrice')
    const amenities = searchParams.get('amenities')
    const sortBy = searchParams.get('sortBy') || 'date-desc'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    let query = supabase
      .from('properties')
      .select('*', { count: 'exact' })
      .eq('status', 'active')
      .eq('availability', 'Available')

    if (location) {
      query = query.or(`city.ilike.%${location}%,area.ilike.%${location}%,locality.ilike.%${location}%`)
    }

    if (propertyType) {
      query = query.eq('property_type', propertyType)
    }

    if (roomType) {
      query = query.eq('room_type', roomType)
    }

    // Price filter: Property matches if at least one room type price falls within the range
    if (minPrice && maxPrice) {
      // Both min and max provided - check if any price falls within range
      query = query.or(
        `and(private_room_price.gte.${minPrice},private_room_price.lte.${maxPrice}),and(double_sharing_price.gte.${minPrice},double_sharing_price.lte.${maxPrice}),and(triple_sharing_price.gte.${minPrice},triple_sharing_price.lte.${maxPrice})`
      )
    } else if (minPrice) {
      // Only min provided - any price >= minPrice
      query = query.or(
        `private_room_price.gte.${minPrice},double_sharing_price.gte.${minPrice},triple_sharing_price.gte.${minPrice}`
      )
    } else if (maxPrice) {
      // Only max provided - any price <= maxPrice
      query = query.or(
        `private_room_price.lte.${maxPrice},double_sharing_price.lte.${maxPrice},triple_sharing_price.lte.${maxPrice}`
      )
    }

    if (amenities) {
      const amenitiesArray = amenities.split(',')
      query = query.contains('amenities', amenitiesArray)
    }

    // Always prioritize featured properties first, then apply the requested sort
    switch (sortBy) {
      case 'price-asc':
        query = query
          .order('featured', { ascending: false })
          .order('private_room_price', { ascending: true, nullsFirst: false })
        break
      case 'price-desc':
        query = query
          .order('featured', { ascending: false })
          .order('private_room_price', { ascending: false, nullsFirst: false })
        break
      case 'popular':
        query = query
          .order('featured', { ascending: false })
          .order('views', { ascending: false })
        break
      case 'featured':
        // Explicit featured-only sort
        query = query
          .order('featured', { ascending: false })
          .order('created_at', { ascending: false })
        break
      case 'date-desc':
      default:
        query = query
          .order('featured', { ascending: false })
          .order('created_at', { ascending: false })
        break
    }


    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) throw error

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching properties:', error)
    return NextResponse.json({ error: 'Failed to fetch properties' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // CSRF Protection
    const csrfCheck = await csrfProtection(request)
    if (!csrfCheck.valid) {
      return NextResponse.json({ error: csrfCheck.error || 'Invalid request' }, { status: 403 })
    }

    // Rate limiting: 5 property creations per hour per user
    const user = await getCurrentUser()
    if (user) {
      const rateLimitKey = `property:create:${user.id}`
      const rateLimitResult = await rateLimit(rateLimitKey, 5, 60 * 60 * 1000)
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        )
      }
    }
    if (!user || user.role !== 'owner') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 🔥 CRITICAL FIX: Check subscription limit BEFORE allowing property creation
    const { checkPropertyLimit } = await import('@/lib/subscription-service')
    const limitCheck = await checkPropertyLimit(user.id)

    if (!limitCheck.allowed) {
      return NextResponse.json({
        error: limitCheck.reason || 'Property limit reached',
        limit: limitCheck.limit,
        current: limitCheck.current,
        planName: limitCheck.planName
      }, { status: 403 })
    }

    const supabase = await createClient()

    const body = await request.json()

    const { data, error } = await supabase
      .from('properties')
      .insert([
        {
          ...body,
          owner_id: user.id,
          owner_name: user.name,
          owner_contact: user.phone || user.email,
          owner_verified: user.verified,
          status: 'pending',
          availability: 'Available',
          views: 0,
          source: 'manual',
        },
      ])
      .select()
      .single()

    if (error) throw error

    // Send email notification (server-side only)
    try {
      const { sendPropertyPostedEmail } = await import('@/lib/email-service')
      await sendPropertyPostedEmail({
        ownerEmail: user.email || '',
        ownerName: user.name,
        propertyTitle: data.title
      })
    } catch (emailError) {
      // Log email error but don't fail the request
      console.error('Failed to send email notification:', emailError)
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error('Error creating property:', error)
    return NextResponse.json({ error: 'Failed to create property' }, { status: 500 })
  }
}
