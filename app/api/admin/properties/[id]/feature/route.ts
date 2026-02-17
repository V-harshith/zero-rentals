import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'

/**
 * POST /api/admin/properties/[id]/feature
 *
 * Toggle the featured status of a property.
 * Admin can feature/unfeature ANY property (including free properties).
 * This overrides the auto-feature behavior from paid subscriptions.
 *
 * Request body: { featured: boolean }
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

    // Rate limiting: 120 feature toggles per hour per admin
    const rateLimitKey = `admin:property:feature:${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'}`
    const rateLimitResult = await rateLimit(rateLimitKey, 120, 60 * 60 * 1000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const { featured } = body

    // Validate featured parameter
    if (typeof featured !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid request: featured must be a boolean' },
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

    // 2. Fetch Property with row locking (Use Admin client)
    const { data: property, error: fetchError } = await supabaseAdmin
      .from('properties')
      .select('id, title, featured, owner_id, status')
      .eq('id', params.id)
      .maybeSingle()

    if (fetchError) {
      throw fetchError
    }

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    // 3. Business Logic: Only active properties can be featured
    if (featured && property.status !== 'active') {
      return NextResponse.json(
        {
          error: `Only active properties can be featured. Current status: ${property.status}`,
          currentStatus: property.status
        },
        { status: 400 }
      )
    }

    // 4. Idempotency check: already in desired state
    if (property.featured === featured) {
      return NextResponse.json({
        success: true,
        message: `Property already ${featured ? 'featured' : 'unfeatured'}`,
        data: {
          id: params.id,
          title: property.title,
          featured: featured,
        },
        changed: false
      })
    }

    // 5. Update featured status directly
    const { error: updateError } = await supabaseAdmin
      .from('properties')
      .update({
        featured: featured,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)

    if (updateError) {
      console.error('[ADMIN FEATURE] Update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update featured status' },
        { status: 500 }
      )
    }

    // 6. Log the status change (best effort - don't fail if logging fails)
    try {
      await supabaseAdmin
        .from('property_status_transitions')
        .insert({
          property_id: params.id,
          old_status: property.status,
          new_status: property.status,
          admin_id: authUser.id,
          reason: `Featured status changed to: ${featured}`,
          created_at: new Date().toISOString()
        })
    } catch (logError) {
      // Log error but don't fail the request
      console.error('[ADMIN FEATURE] Failed to log transition:', logError)
    }

    return NextResponse.json({
      success: true,
      data: {
        id: params.id,
        title: property.title,
        featured: featured,
      },
      message: featured ? 'Property featured successfully' : 'Property unfeatured successfully',
      changed: true
    })
  } catch (error: any) {
    console.error('[ADMIN FEATURE] Error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Failed to update featured status' },
      { status: 500 }
    )
  }
}
