import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isTokenExpired } from '@/lib/verification-utils'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.redirect(
        new URL('/profile/admin?error=missing_token', request.url)
      )
    }

    // Find user by token
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, pending_email, email_change_expires_at, email_change_verified, name')
      .eq('email_change_token', token)
      .single()

    if (userError || !user) {
      console.error('[verify-email-change] Invalid token:', userError)
      return NextResponse.redirect(
        new URL('/profile/admin?error=invalid_token', request.url)
      )
    }

    // Check if token is expired
    if (isTokenExpired(user.email_change_expires_at)) {
      // Clear expired token
      await supabaseAdmin
        .from('users')
        .update({
          pending_email: null,
          email_change_token: null,
          email_change_expires_at: null,
          email_change_verified: false
        })
        .eq('id', user.id)

      return NextResponse.redirect(
        new URL('/profile/admin?error=expired_token', request.url)
      )
    }

    // Check if already verified
    if (user.email_change_verified) {
      return NextResponse.redirect(
        new URL('/profile/admin?info=already_verified', request.url)
      )
    }

    // Check if new email is still available (not taken by another user)
    const { data: existingUser, error: existingError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', user.pending_email)
      .neq('id', user.id)
      .maybeSingle()

    if (existingError) {
      console.error('[verify-email-change] Error checking email availability:', existingError)
      return NextResponse.redirect(
        new URL('/profile/admin?error=verification_failed', request.url)
      )
    }

    if (existingUser) {
      // Clear pending change since email is no longer available
      await supabaseAdmin
        .from('users')
        .update({
          pending_email: null,
          email_change_token: null,
          email_change_expires_at: null,
          email_change_verified: false
        })
        .eq('id', user.id)

      return NextResponse.redirect(
        new URL('/profile/admin?error=email_unavailable', request.url)
      )
    }

    // Update Supabase Auth email
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { email: user.pending_email! }
    )

    if (authUpdateError) {
      console.error('[verify-email-change] Error updating auth email:', authUpdateError)
      return NextResponse.redirect(
        new URL('/profile/admin?error=auth_update_failed', request.url)
      )
    }

    // Update database email and clear pending fields
    const { error: dbUpdateError } = await supabaseAdmin
      .from('users')
      .update({
        email: user.pending_email,
        pending_email: null,
        email_change_token: null,
        email_change_expires_at: null,
        email_change_verified: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)

    if (dbUpdateError) {
      console.error('[verify-email-change] Error updating database:', dbUpdateError)
      // Note: Auth email is already updated, this is a partial failure
      // In production, you might want to handle this more gracefully
      return NextResponse.redirect(
        new URL('/profile/admin?error=partial_update', request.url)
      )
    }

    // Log successful email change for audit
    console.log(`[AUDIT] Admin ${user.id} successfully changed email from ${user.email} to ${user.pending_email}`)

    // Redirect to profile page with success message
    return NextResponse.redirect(
      new URL('/profile/admin?success=email_changed', request.url)
    )

  } catch (error) {
    console.error('[verify-email-change] Unexpected error:', error)
    return NextResponse.redirect(
      new URL('/profile/admin?error=unexpected', request.url)
    )
  }
}
