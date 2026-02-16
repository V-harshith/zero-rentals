import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendPropertyApprovalNotification } from '@/lib/email-service'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'

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

    // Idempotency check: If already approved/active, return success
    if (property.status === 'active') {
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

    // Only allow approval from pending status
    if (property.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot approve property with status: ${property.status}` },
        { status: 400 }
      )
    }

    // 3. Update Property with optimistic locking (Use Admin Client to BYPASS RLS)
    // Only update if status is still 'pending' to prevent race conditions
    const { data, error } = await supabaseAdmin
      .from('properties')
      .update({
        status: 'active',
        availability: 'Available', // CRITICAL: Required for properties to show in getProperties()
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('status', 'pending') // Optimistic lock - only update if still pending
      .select()
      .maybeSingle()

    // If no rows updated, another request may have already processed it
    if (!data && !error) {
      const { data: currentProperty } = await supabaseAdmin
        .from('properties')
        .select('*')
        .eq('id', params.id)
        .single()

      if (currentProperty?.status === 'active') {
        return NextResponse.json({
          success: true,
          message: 'Property already approved',
          data: currentProperty
        })
      }

      return NextResponse.json(
        { error: 'Property status changed during approval. Please refresh and try again.' },
        { status: 409 }
      )
    }

    if (error) {
      throw error
    }

    // 4. Send Email (Fail Safe)
    if (property && property.owner_id) {
      try {
        // Use Admin client here too just in case
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

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('[ADMIN APPROVE] Error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Failed to approve property' },
      { status: 500 }
    )
  }
}
