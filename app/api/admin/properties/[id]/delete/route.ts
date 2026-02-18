import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'

/**
 * POST /api/admin/properties/[id]/delete
 *
 * Delete a single property.
 *
 * No request body required.
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

    // Rate limiting: 60 deletions per hour per admin (after auth, using user ID)
    const rateLimitKey = `admin:property:delete:${authUser.id}`
    const rateLimitResult = await rateLimit(rateLimitKey, 60, 60 * 60 * 1000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    // 2. Fetch Property to verify it exists (Use Admin client)
    const { data: property, error: fetchError } = await supabaseAdmin
      .from('properties')
      .select('id, title')
      .eq('id', params.id)
      .maybeSingle()

    if (fetchError) {
      throw fetchError
    }

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    // 3. Delete the property
    const { error: deleteError } = await supabaseAdmin
      .from('properties')
      .delete()
      .eq('id', params.id)

    if (deleteError) {
      console.error('[ADMIN DELETE] Delete error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete property' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        id: params.id,
        title: property.title,
      },
      message: 'Property deleted successfully'
    })
  } catch (error: any) {
    console.error('[ADMIN DELETE] Error:', error?.message || error)
    return NextResponse.json(
      { error: 'An internal error occurred' },
      { status: 500 }
    )
  }
}
