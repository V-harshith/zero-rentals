import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'
import { acquirePropertyLock, releasePropertyLock } from '@/lib/property-locks'

/**
 * POST /api/admin/properties/[id]/verify
 *
 * Toggle the verified status of a property with database-level concurrent edit protection.
 * Uses distributed locking via PostgreSQL to prevent race conditions
 * across Vercel serverless instances.
 *
 * Request body: { verified: boolean }
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
    const { verified } = body

    // Validate verified parameter
    if (typeof verified !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid request: verified must be a boolean' },
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

    // Rate limiting: 120 verify toggles per hour per admin (after auth, using user ID)
    const rateLimitKey = `admin:property:verify:${authUser.id}`
    const rateLimitResult = await rateLimit(rateLimitKey, 120, 60 * 60 * 1000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    // 2. Acquire distributed lock for concurrent edit protection
    const lockResult = await acquirePropertyLock(params.id, authUser.id, 30, 'verify')
    if (!lockResult.success) {
      return NextResponse.json(
        {
          error: lockResult.error || 'Property is being processed by another admin. Please try again later.',
          locked_by: lockResult.adminId,
          expires_at: lockResult.expiresAt,
          seconds_remaining: lockResult.secondsRemaining
        },
        { status: 423 } // Locked
      )
    }

    try {
      // 3. Fetch Property (Use Admin client)
      const { data: property, error: fetchError } = await supabaseAdmin
        .from('properties')
        .select('id, title, verified')
        .eq('id', params.id)
        .maybeSingle()

      if (fetchError) {
        throw fetchError
      }

      if (!property) {
        return NextResponse.json({ error: 'Property not found' }, { status: 404 })
      }

      // 4. Idempotency check: already in desired state
      if (property.verified === verified) {
        return NextResponse.json({
          success: true,
          message: `Property already ${verified ? 'verified' : 'unverified'}`,
          data: {
            id: params.id,
            title: property.title,
            verified: verified,
          },
          changed: false
        })
      }

      // 5. Update verified status
      const { error: updateError } = await supabaseAdmin
        .from('properties')
        .update({
          verified: verified,
          updated_at: new Date().toISOString()
        })
        .eq('id', params.id)

      if (updateError) {
        console.error('[ADMIN VERIFY] Update error:', updateError)
        return NextResponse.json(
          { error: 'Failed to update verified status' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        data: {
          id: params.id,
          title: property.title,
          verified: verified,
        },
        message: verified ? 'Property verified successfully' : 'Property unverified successfully',
        changed: true
      })
    } finally {
      // Always release the lock
      await releasePropertyLock(params.id, authUser.id, 'verify')
    }
  } catch (error: any) {
    console.error('[ADMIN VERIFY] Error:', error?.message || error)
    return NextResponse.json(
      { error: 'An internal error occurred' },
      { status: 500 }
    )
  }
}
