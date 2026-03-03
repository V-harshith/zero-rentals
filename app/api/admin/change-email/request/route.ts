import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentUser } from '@/lib/auth'
import { csrfProtection } from '@/lib/csrf-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { generateVerificationToken, getTokenExpiry } from '@/lib/verification-utils'
import { sendEmailChangeVerificationEmail } from '@/lib/email-service'
import { z } from 'zod'

const requestSchema = z.object({
  newEmail: z.string().email('Invalid email address'),
  currentPassword: z.string().min(1, 'Current password is required')
})

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

    // Rate limiting: 3 attempts per hour
    const rateLimitResult = await checkRateLimit(request, 'admin:change-email:request', 3, 60 * 60 * 1000)
    if (rateLimitResult.limited) {
      return NextResponse.json(
        { error: 'Too many email change attempts. Please try again later.' },
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

    // Parse and validate request body
    const body = await request.json()
    const validation = requestSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      )
    }

    const { newEmail, currentPassword } = validation.data

    // Check if new email is same as current
    if (newEmail.toLowerCase() === user.email?.toLowerCase()) {
      return NextResponse.json(
        { error: 'New email must be different from your current email' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Verify current password by attempting to sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword
    })

    if (signInError) {
      return NextResponse.json(
        { error: 'Incorrect current password' },
        { status: 401 }
      )
    }

    // Check if new email is already in use by another user
    const { data: existingUser, error: existingError } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('email', newEmail.toLowerCase())
      .neq('id', user.id)
      .maybeSingle()

    if (existingError) {
      console.error('[change-email] Error checking existing email:', existingError)
      return NextResponse.json(
        { error: 'Failed to verify email availability' },
        { status: 500 }
      )
    }

    if (existingUser) {
      return NextResponse.json(
        { error: 'This email address is already in use by another account' },
        { status: 409 }
      )
    }

    // Check if there's already a pending email change
    const { data: currentPending } = await supabaseAdmin
      .from('users')
      .select('pending_email, email_change_expires_at')
      .eq('id', user.id)
      .single()

    if (currentPending?.pending_email &&
        currentPending.email_change_expires_at &&
        new Date(currentPending.email_change_expires_at) > new Date()) {
      return NextResponse.json(
        { error: 'You already have a pending email change. Please check your email or cancel the pending change.' },
        { status: 409 }
      )
    }

    // Generate verification token
    const token = generateVerificationToken()
    const expiresAt = getTokenExpiry()

    // Store pending email change in database
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        pending_email: newEmail.toLowerCase(),
        email_change_token: token,
        email_change_expires_at: expiresAt.toISOString(),
        email_change_verified: false
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('[change-email] Error storing pending email:', updateError)
      return NextResponse.json(
        { error: 'Failed to initiate email change' },
        { status: 500 }
      )
    }

    // Send verification email to new address
    await sendEmailChangeVerificationEmail(
      newEmail.toLowerCase(),
      user.name || 'Admin User',
      token
    )

    // Log the email change request for audit
    console.log(`[AUDIT] Admin ${user.id} requested email change from ${user.email} to ${newEmail}`)

    return NextResponse.json({
      success: true,
      message: 'Verification email sent. Please check your new email address to complete the change.',
      pendingEmail: newEmail.toLowerCase()
    })

  } catch (error) {
    console.error('[change-email] Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
