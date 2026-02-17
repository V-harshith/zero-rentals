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

    // 2. Fetch Property to verify it exists (Use Admin client)
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

    // 3. Use atomic featured status update (server-side only with admin client)
    const { data: rpcResult, error: rpcError } = await supabaseAdmin
      .rpc('set_property_featured', {
        p_property_id: params.id,
        p_featured: featured,
        p_admin_id: authUser.id
      })

    if (rpcError) {
      // Handle specific error: only active properties can be featured
      if (rpcError.message?.includes('Only active properties can be featured')) {
        return NextResponse.json(
          { error: rpcError.message, currentStatus: property.status },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { error: rpcError.message || 'Failed to update featured status' },
        { status: 500 }
      )
    }

    const featuredResult = rpcResult as {
      success: boolean
      message?: string
      error?: string
      featured?: boolean
      changed?: boolean
    }

    if (!featuredResult.success) {
      // Handle idempotency
      if (featuredResult.error?.includes('already set to')) {
        return NextResponse.json({
          success: true,
          message: `Property already ${featured ? 'featured' : 'unfeatured'}`,
          data: {
            id: params.id,
            title: property.title,
            featured: featured,
          }
        })
      }

      return NextResponse.json(
        { error: featuredResult.error || 'Failed to update featured status' },
        { status: 500 }
      )
    }

    // Fetch updated property data
    const { data: updatedProperty, error: fetchUpdatedError } = await supabaseAdmin
      .from('properties')
      .select('id, title, featured')
      .eq('id', params.id)
      .single()

    if (fetchUpdatedError) {
      console.error('[ADMIN FEATURE] Failed to fetch updated property:', fetchUpdatedError)
    }

    return NextResponse.json({
      success: true,
      data: updatedProperty || {
        id: params.id,
        title: property.title,
        featured: featured,
      },
      message: featuredResult?.message || (featured ? 'Property featured successfully' : 'Property unfeatured successfully'),
      changed: featuredResult.changed
    })
  } catch (error: any) {
    console.error('[ADMIN FEATURE] Error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Failed to update featured status' },
      { status: 500 }
    )
  }
}
