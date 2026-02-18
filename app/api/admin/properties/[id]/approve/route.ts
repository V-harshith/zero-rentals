import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendPropertyApprovalNotification } from '@/lib/email-service'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'

// Approval lock cache to prevent concurrent approvals (in-memory, per-instance)
// For multi-instance deployments, this should be replaced with Redis or similar
const approvalLocks = new Map<string, { timestamp: number; adminId: string }>()
const LOCK_TTL_MS = 30000 // 30 seconds

/**
 * Clean up expired locks periodically
 */
function cleanupExpiredLocks(): void {
  const now = Date.now()
  for (const [propertyId, lock] of approvalLocks.entries()) {
    if (now - lock.timestamp > LOCK_TTL_MS) {
      approvalLocks.delete(propertyId)
    }
  }
}

/**
 * Acquire approval lock for a property
 * Returns true if lock acquired, false if already locked
 */
function acquireApprovalLock(propertyId: string, adminId: string): boolean {
  cleanupExpiredLocks()

  const existingLock = approvalLocks.get(propertyId)
  if (existingLock && existingLock.adminId !== adminId) {
    // Another admin is currently processing this property
    return false
  }

  approvalLocks.set(propertyId, { timestamp: Date.now(), adminId })
  return true
}

/**
 * Release approval lock for a property
 */
function releaseApprovalLock(propertyId: string, adminId: string): void {
  const existingLock = approvalLocks.get(propertyId)
  if (existingLock && existingLock.adminId === adminId) {
    approvalLocks.delete(propertyId)
  }
}

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

    // 2. Check for concurrent approval (in-memory lock)
    if (!acquireApprovalLock(params.id, authUser.id)) {
      return NextResponse.json(
        { error: 'Property is being processed by another admin. Please try again later.' },
        { status: 423 }
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
      // Always release the lock
      releaseApprovalLock(params.id, authUser.id)
    }
  } catch (error: any) {
    console.error('[ADMIN APPROVE] Error:', error?.message || error)
    return NextResponse.json(
      { error: 'An internal error occurred' },
      { status: 500 }
    )
  }
}
