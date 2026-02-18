import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'

/**
 * POST /api/admin/properties/[id]/type
 *
 * Change the property type of a property.
 *
 * Request body: { property_type: 'PG' | 'Co-living' | 'Rent' }
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    // CSRF Protection
    const csrfCheck = await csrfProtection(request)
    if (!csrfCheck.valid) {
      return NextResponse.json({ error: csrfCheck.error || 'Invalid request' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const { property_type } = body

    // Validate property_type parameter
    const validTypes = ['PG', 'Co-living', 'Rent']
    if (!property_type || !validTypes.includes(property_type)) {
      return NextResponse.json(
        { error: `Invalid request: property_type must be one of ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // 1. Verify Authentication & Admin Role (Standard Client)
    const supabase = await createClient()
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', authUser.id)
      .maybeSingle()

    if (profileError || !userProfile || userProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    // Rate limiting: 120 type changes per hour per admin (after auth, using user ID)
    const rateLimitKey = `admin:property:type:${authUser.id}`
    const rateLimitResult = await rateLimit(rateLimitKey, 120, 60 * 60 * 1000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    // 2. Fetch Property (Use Admin client)
    const { data: property, error: fetchError } = await supabaseAdmin
      .from('properties')
      .select('id, title, property_type')
      .eq('id', params.id)
      .maybeSingle()

    if (fetchError) {
      throw fetchError
    }

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    // 3. Idempotency check: already in desired state
    if (property.property_type === property_type) {
      return NextResponse.json({
        success: true,
        message: `Property already has type: ${property_type}`,
        data: {
          id: params.id,
          title: property.title,
          property_type: property_type,
        },
        changed: false
      })
    }

    // 4. Update property type
    const { error: updateError } = await supabaseAdmin
      .from('properties')
      .update({
        property_type: property_type,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)

    if (updateError) {
      console.error('[ADMIN TYPE] Update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update property type' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        id: params.id,
        title: property.title,
        property_type: property_type,
      },
      message: `Property type changed to ${property_type} successfully`,
      changed: true
    })
  } catch (error: any) {
    console.error('[ADMIN TYPE] Error:', error?.message || error)
    return NextResponse.json(
      { error: 'An internal error occurred' },
      { status: 500 }
    )
  }
}
