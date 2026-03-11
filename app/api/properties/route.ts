import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'
import { PLAN_TIER_RANK, getPlanTierRank } from '@/lib/constants'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const location = searchParams.get('location')
    const city = searchParams.get('city')  // NEW: Structured city param
    const propertyType = searchParams.get('propertyType')
    const roomType = searchParams.get('roomType')
    const minPrice = searchParams.get('minPrice')
    const maxPrice = searchParams.get('maxPrice')
    const amenities = searchParams.get('amenities')
    const sortBy = searchParams.get('sortBy') || 'date-desc'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    // Get owners with valid active subscriptions and their plan names
    const today = new Date().toISOString()
    const { data: validSubscribers, error: subError } = await supabase
      .from('subscriptions')
      .select('user_id, plan_name')
      .eq('status', 'active')
      .gt('end_date', today)

    if (subError) {
      console.error('Error fetching valid subscriptions:', subError)
    }

    // Create a map of owner_id to plan tier rank
    const ownerTierMap = new Map<string, number>()
    validSubscribers?.forEach(s => {
      const rank = getPlanTierRank(s.plan_name)
      // Only update if higher rank (or not set yet)
      const existingRank = ownerTierMap.get(s.user_id)
      if (!existingRank || rank > existingRank) {
        ownerTierMap.set(s.user_id, rank)
      }
    })

    // Build base query
    let query = supabase
      .from('properties')
      .select('*', { count: 'exact' })
      .eq('status', 'active')
      .eq('availability', 'Available')

    if (location) {
      // SMART LOCATION SEARCH: Prioritize area matches over city matches
      // If city param is also provided, use AND logic for precise matching
      if (city) {
        // Combined search: area AND city (most precise)
        query = query.or(`area.ilike.%${location}%,locality.ilike.%${location}%`)
        query = query.ilike('city', `%${city}%`)
      } else {
        // Single location search: search area/locality first, city as fallback
        query = query.or(`area.ilike.%${location}%,locality.ilike.%${location}%,city.ilike.%${location}%`)
      }
    }

    if (propertyType) {
      query = query.eq('property_type', propertyType)
    }

    if (roomType) {
      // Map room type to price column - property matches if it has a price for this room type
      // 1RK now has its own column separate from private_room_price (1BHK/Single)
      // Support both "Single" and "Single Sharing" formats from QuickFilters
      const roomTypeToPriceColumn: Record<string, string> = {
        'Private Room': 'private_room_price',
        '1 RK': 'one_rk_price',
        '1 BHK': 'private_room_price',
        'Single': 'private_room_price',
        'Single Sharing': 'private_room_price',
        'Double': 'double_sharing_price',
        'Double Sharing': 'double_sharing_price',
        '2 BHK': 'double_sharing_price',
        'Triple': 'triple_sharing_price',
        'Triple Sharing': 'triple_sharing_price',
        '3 BHK': 'triple_sharing_price',
        'Four Sharing': 'four_sharing_price',
        '4 BHK': 'four_sharing_price'
      }

      const priceColumn = roomTypeToPriceColumn[roomType]
      if (priceColumn) {
        query = query.not(priceColumn, 'is', null)
      }
    }

    // Price filter: Property matches if at least one room type price falls within the range
    // Include one_rk_price and four_sharing_price for all price filters
    if (minPrice && maxPrice) {
      // Both min and max provided - check if any price falls within range
      query = query.or(
        `and(one_rk_price.gte.${minPrice},one_rk_price.lte.${maxPrice}),and(private_room_price.gte.${minPrice},private_room_price.lte.${maxPrice}),and(double_sharing_price.gte.${minPrice},double_sharing_price.lte.${maxPrice}),and(triple_sharing_price.gte.${minPrice},triple_sharing_price.lte.${maxPrice}),and(four_sharing_price.gte.${minPrice},four_sharing_price.lte.${maxPrice})`
      )
    } else if (minPrice) {
      // Only min provided - any price >= minPrice
      query = query.or(
        `one_rk_price.gte.${minPrice},private_room_price.gte.${minPrice},double_sharing_price.gte.${minPrice},triple_sharing_price.gte.${minPrice},four_sharing_price.gte.${minPrice}`
      )
    } else if (maxPrice) {
      // Only max provided - any price <= maxPrice
      query = query.or(
        `one_rk_price.lte.${maxPrice},private_room_price.lte.${maxPrice},double_sharing_price.lte.${maxPrice},triple_sharing_price.lte.${maxPrice},four_sharing_price.lte.${maxPrice}`
      )
    }

    if (amenities) {
      const amenitiesArray = amenities.split(',')
      query = query.contains('amenities', amenitiesArray)
    }

    // Apply sorting - always prioritize featured first, then apply requested sort
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

    // Sort results by plan tier priority
    // Order: Plan tier (highest first) -> Featured -> Requested sort
    const sortedData = (data || []).sort((a: any, b: any) => {
      const aTier = ownerTierMap.get(a.owner_id) ?? PLAN_TIER_RANK.FREE
      const bTier = ownerTierMap.get(b.owner_id) ?? PLAN_TIER_RANK.FREE

      // Different tiers: higher tier first
      if (aTier !== bTier) {
        return bTier - aTier
      }

      // Same tier: featured first
      if (a.featured && !b.featured) return -1
      if (!a.featured && b.featured) return 1

      // Same tier and featured status: apply requested sort
      switch (sortBy) {
        case 'price-asc':
          return (a.private_room_price || 0) - (b.private_room_price || 0)
        case 'price-desc':
          return (b.private_room_price || 0) - (a.private_room_price || 0)
        case 'popular':
          return (b.views || 0) - (a.views || 0)
        case 'featured':
        case 'date-desc':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })

    return NextResponse.json({
      data: sortedData,
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

    const user = await getCurrentUser()

    // Check authentication - allow both owner and admin roles
    if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isAdmin = user.role === 'admin'

    // Rate limiting: 5 property creations per hour per user (skip for admin)
    if (!isAdmin) {
      const rateLimitKey = `property:create:${user.id}`
      const rateLimitResult = await rateLimit(rateLimitKey, 5, 60 * 60 * 1000)
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        )
      }
    }

    // 🔥 CRITICAL FIX: Check subscription limit BEFORE allowing property creation (skip for admin)
    if (!isAdmin) {
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
    }

    const supabase = await createClient()

    const body = await request.json()

    // 🔒 CRITICAL: Validate payment for additional properties
    if (body.payment_status === 'paid') {
      // Must have a payment_transaction_id
      if (!body.payment_transaction_id) {
        return NextResponse.json(
          { error: 'Payment transaction ID required for paid properties' },
          { status: 400 }
        )
      }

      // Verify the payment exists in payment_logs and was successful
      const { data: paymentLog, error: paymentError } = await supabase
        .from('payment_logs')
        .select('id, status, transaction_id')
        .eq('transaction_id', body.payment_transaction_id)
        .maybeSingle()

      if (paymentError || !paymentLog) {
        return NextResponse.json(
          { error: 'Invalid payment transaction' },
          { status: 400 }
        )
      }

      if (paymentLog.status !== 'completed' && paymentLog.status !== 'success') {
        return NextResponse.json(
          { error: 'Payment not completed' },
          { status: 400 }
        )
      }

      // Verify the transaction hasn't been used for another property
      const { data: existingProperty, error: existingError } = await supabase
        .from('properties')
        .select('id')
        .eq('payment_transaction_id', body.payment_transaction_id)
        .neq('id', body.id || '00000000-0000-0000-0000-000000000000') // Exclude current property if updating
        .maybeSingle()

      if (existingProperty) {
        return NextResponse.json(
          { error: 'Payment already used for another property' },
          { status: 400 }
        )
      }
    }

    // 🔒 CRITICAL: Validate legal consents for owners (not admins)
    if (user.role === 'owner') {
      if (!body.consent_published || !body.consent_images || !body.consent_contact) {
        return NextResponse.json(
          { error: 'All legal consents are required to post a property' },
          { status: 400 }
        )
      }
    }

    // Prepare property data with consents (for owners) or defaults (for admins)
    const propertyData = {
      ...body,
      consent_published: user.role === 'owner' ? body.consent_published : true,
      consent_images: user.role === 'owner' ? body.consent_images : true,
      consent_contact: user.role === 'owner' ? body.consent_contact : true,
      consented_at: user.role === 'owner' ? new Date().toISOString() : null,
    }

    const { data, error } = await supabase
      .from('properties')
      .insert([
        {
          ...propertyData,
          owner_id: user.id,
          owner_name: user.name,
          owner_contact: user.phone || user.email,
          owner_verified: user.verified,
          status: isAdmin ? 'active' : 'pending',
          availability: 'Available',
          views: 0,
          source: isAdmin ? 'admin' : 'manual',
        },
      ])
      .select()
      .single()

    if (error) {
      // Handle property limit exceeded error from database trigger
      if (error.message?.includes('Property limit exceeded')) {
        return NextResponse.json({
          error: 'Property limit reached for your plan. Please upgrade to add more properties.',
          code: 'PROPERTY_LIMIT_EXCEEDED'
        }, { status: 403 })
      }
      throw error
    }

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
