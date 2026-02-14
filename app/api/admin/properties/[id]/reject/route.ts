import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendPropertyRejectionNotification } from '@/lib/email-service'
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

    // Rate limiting: 60 property rejections per hour per admin
    const rateLimitKey = `admin:property:reject:${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'}`
    const rateLimitResult = await rateLimit(rateLimitKey, 60, 60 * 60 * 1000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    const { reason } = await request.json()

    // Validate rejection reason
    if (reason && typeof reason !== 'string') {
      return NextResponse.json({ error: 'Invalid reason format' }, { status: 400 })
    }
    if (reason && reason.length > 500) {
      return NextResponse.json({ error: 'Reason too long (max 500 characters)' }, { status: 400 })
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

    // 2. Fetch Property (Admin Client)
    const { data: property, error: fetchError } = await supabaseAdmin
      .from('properties')
      .select('title, owner_id')
      .eq('id', params.id)
      .maybeSingle()

    if (fetchError) {
      throw fetchError
    }

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    // 3. Update Property (Admin Client - Bypass RLS)
    const { data, error } = await supabaseAdmin
      .from('properties')
      .update({
        status: 'rejected',
      })
      .eq('id', params.id)
      .select()
      .maybeSingle()

    if (error) {
      throw error
    }

    // 4. Send Email (Fail Safe)
    if (property && property.owner_id) {
      try {
        const { data: owner, error: ownerError } = await supabaseAdmin
          .from('users')
          .select('email, name')
          .eq('id', property.owner_id)
          .maybeSingle()

        if (owner && !ownerError) {
          await sendPropertyRejectionNotification({
            ownerEmail: owner.email,
            ownerName: owner.name,
            propertyTitle: property.title,
            reason: reason || 'Does not meet our guidelines',
          })
        }
      } catch {
        // Email failed - non-fatal
      }
    }

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to reject property' }, { status: 500 })
  }
}
