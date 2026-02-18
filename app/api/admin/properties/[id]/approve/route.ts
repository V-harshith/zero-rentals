import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendPropertyApprovalNotification } from '@/lib/email-service'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'
import { acquirePropertyLock, releasePropertyLock } from '@/lib/property-locks'

/**
 * PUT /api/admin/properties/[id]/approve
 *
 * Approve a property with database-level concurrent edit protection.
 * Uses distributed locking via PostgreSQL to prevent race conditions
 * across Vercel serverless instances.
 */
export async function PUT(
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

    // Rate limiting: 60 property approvals per hour per admin (after auth to use user ID)
    const rateLimitKey = `admin:property:approve:${authUser.id}`
    const rateLimitResult = await rateLimit(rateLimitKey, 60, 60 * 60 * 1000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    // 2. Acquire distributed lock for concurrent edit protection
    // This prevents multiple admins from processing the same property simultaneously
    const lockResult = await acquirePropertyLock(params.id, authUser.id, 30, 'approve')
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
      // 3. Use atomic RPC for status transition with row-level locking
      // The database function handles: FOR UPDATE lock, idempotency, state machine validation
      const { data: transitionResult, error: transitionError } = await supabaseAdmin.rpc(
        'transition_property_status',
        {
          p_property_id: params.id,
          p_new_status: 'active',
          p_admin_id: authUser.id,
          p_reason: 'Property approved by admin'
        }
      )

      if (transitionError) {
        throw new Error(`Transition failed: ${transitionError.message}`)
      }

      // Parse the RPC result
      const result = transitionResult as {
        success: boolean
        message?: string
        error?: string
        property_id?: string
        old_status?: string
        new_status?: string
        changed?: boolean
        transition_id?: string
        owner_id?: string
        property_title?: string
      }

      if (!result.success) {
        // Handle idempotency - property already approved
        if (result.error?.includes('already has status')) {
          const { data: existingProperty } = await supabaseAdmin
            .from('properties')
            .select('*')
            .eq('id', params.id)
            .single()

          return NextResponse.json({
            success: true,
            message: 'Property already approved',
            data: existingProperty
          })
        }

        // Handle invalid status transition
        if (result.error?.includes('Invalid status transition')) {
          return NextResponse.json(
            { error: result.error },
            { status: 400 }
          )
        }

        return NextResponse.json(
          { error: result.error || 'Failed to approve property' },
          { status: 500 }
        )
      }

      // 4. Fetch the updated property data for response
      const { data: updatedProperty, error: fetchUpdatedError } = await supabaseAdmin
        .from('properties')
        .select('*')
        .eq('id', params.id)
        .single()

      if (fetchUpdatedError) {
        // Transition succeeded but fetch failed - log but don't fail
        console.error('[ADMIN APPROVE] Failed to fetch updated property:', fetchUpdatedError)
      }

      // 5. Send Email (Fail Safe) - only if this was an actual change
      if (result.changed && result.owner_id) {
        try {
          const { data: owner, error: ownerError } = await supabaseAdmin
            .from('users')
            .select('email, name')
            .eq('id', result.owner_id)
            .maybeSingle()

          if (owner && !ownerError) {
            await sendPropertyApprovalNotification({
              ownerEmail: owner.email,
              ownerName: owner.name,
              propertyTitle: result.property_title || 'Your Property',
            })
          }
        } catch {
          // Email failed - non-fatal
        }
      }

      return NextResponse.json({
        success: true,
        message: result.message || 'Property approved successfully',
        data: updatedProperty,
        transition: {
          oldStatus: result.old_status,
          newStatus: result.new_status,
          transitionId: result.transition_id
        }
      })
    } finally {
      // Always release the lock, even if the operation failed
      await releasePropertyLock(params.id, authUser.id, 'approve')
    }
  } catch (error: any) {
    console.error('[ADMIN APPROVE] Error:', error?.message || error)
    return NextResponse.json(
      { error: 'An internal error occurred' },
      { status: 500 }
    )
  }
}
