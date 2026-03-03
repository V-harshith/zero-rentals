import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentUser } from '@/lib/auth'
import { csrfProtection } from '@/lib/csrf-server'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    // CSRF Protection
    const csrfCheck = await csrfProtection(request)
    if (!csrfCheck.valid) {
      return NextResponse.json(
        { error: csrfCheck.error || 'Invalid request' },
        { status: 403 }
      )
    }

    // Rate limiting: 10 attempts per minute
    const rateLimitResult = await checkRateLimit(request, 'admin:change-email:cancel', 10, 60 * 1000)
    if (rateLimitResult.limited) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429, headers: rateLimitResult.headers }
      )
    }

    // Get current user
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get current pending email info before clearing
    const { data: currentData, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('pending_email')
      .eq('id', user.id)
      .single()

    if (fetchError) {
      console.error('[cancel-email-change] Error fetching user:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch user data' },
        { status: 500 }
      )
    }

    if (!currentData?.pending_email) {
      return NextResponse.json(
        { error: 'No pending email change to cancel' },
        { status: 400 }
      )
    }

    // Clear pending email fields
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        pending_email: null,
        email_change_token: null,
        email_change_expires_at: null,
        email_change_verified: false
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('[cancel-email-change] Error clearing pending email:', updateError)
      return NextResponse.json(
        { error: 'Failed to cancel email change' },
        { status: 500 }
      )
    }

    // Log cancellation for audit
    console.log(`[AUDIT] Admin ${user.id} cancelled email change from ${user.email} to ${currentData.pending_email}`)

    return NextResponse.json({
      success: true,
      message: 'Email change request cancelled successfully'
    })

  } catch (error) {
    console.error('[cancel-email-change] Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
