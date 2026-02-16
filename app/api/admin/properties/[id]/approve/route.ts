import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendPropertyApprovalNotification } from '@/lib/email-service'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'
import { transitionPropertyStatus } from '@/lib/data-service'

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

    // Rate limiting: 60 property approvals per hour per admin
    const rateLimitKey = `admin:property:approve:${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'}`
    const rateLimitResult = await rateLimit(rateLimitKey, 60, 60 * 60 * 1000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
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

    // 2. Fetch Property to check "owner_id" and current status (Use Admin client to be safe against RLS on Select too)
    const { data: property, error: fetchError } = await supabaseAdmin
      .from('properties')
      .select('title, owner_id, status')
      .eq('id', params.id)
      .maybeSingle()

    if (fetchError) {
      throw fetchError
    }

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    // 3. Use atomic status transition (handles idempotency, validation, and race conditions)
    const transitionResult = await transitionPropertyStatus(
      params.id,
      'active',
      authUser.id,
      'Property approved by admin'
    )

    if (!transitionResult.success) {
      // Handle specific error cases
      if (transitionResult.error?.includes('already has status')) {
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

      if (transitionResult.error?.includes('Invalid status transition')) {
        return NextResponse.json(
          { error: transitionResult.error },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { error: transitionResult.error || 'Failed to approve property' },
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

    // 5. Send Email (Fail Safe)
    if (property && property.owner_id && transitionResult.changed) {
      try {
        const { data: owner, error: ownerError } = await supabaseAdmin
          .from('users')
          .select('email, name')
          .eq('id', property.owner_id)
          .maybeSingle()

        if (owner && !ownerError) {
          await sendPropertyApprovalNotification({
            ownerEmail: owner.email,
            ownerName: owner.name,
            propertyTitle: property.title,
          })
        }
      } catch {
        // Email failed - non-fatal
      }
    }

    return NextResponse.json({
      success: true,
      message: transitionResult.message || 'Property approved successfully',
      data: updatedProperty,
      transition: {
        oldStatus: transitionResult.oldStatus,
        newStatus: transitionResult.newStatus,
        transitionId: transitionResult.transitionId
      }
    })
  } catch (error: any) {
    console.error('[ADMIN APPROVE] Error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Failed to approve property' },
      { status: 500 }
    )
  }
}
