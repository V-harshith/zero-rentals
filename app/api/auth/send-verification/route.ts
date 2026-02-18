import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import crypto from 'crypto'

// Rate limiting store (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(email: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  const key = `send_verification:${email}`
  const limit = rateLimitStore.get(key)

  if (limit) {
    if (now < limit.resetAt) {
      if (limit.count >= 3) {
        return { allowed: false, retryAfter: Math.ceil((limit.resetAt - now) / 1000) }
      }
      limit.count++
      return { allowed: true }
    } else {
      // Reset window
      rateLimitStore.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 }) // 1 hour
      return { allowed: true }
    }
  } else {
    rateLimitStore.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 })
    return { allowed: true }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email, name, role } = await request.json()

    if (!email || !name || !role) {
      return NextResponse.json(
        { message: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Rate limiting
    const rateLimit = checkRateLimit(email)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { message: `Too many attempts. Please try again in ${rateLimit.retryAfter} seconds.` },
        { status: 429 }
      )
    }

    // Check if user exists
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email_verified_at')
      .eq('email', email)
      .single()

    if (userError && userError.code !== 'PGRST116') {
      throw userError
    }

    if (!user) {
      return NextResponse.json(
        { message: 'No account found with this email' },
        { status: 404 }
      )
    }

    if (user.email_verified_at) {
      return NextResponse.json(
        { message: 'Email already verified' },
        { status: 400 }
      )
    }

    // Generate new verification token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // Update user with new token
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        verification_token: token,
        token_expires_at: expiresAt.toISOString(),
      })
      .eq('id', user.id)

    if (updateError) {
      throw updateError
    }

    // Send verification email
    const { sendVerificationEmailAction } = await import('@/app/actions/auth-actions')
    const emailResult = await sendVerificationEmailAction(email, name, token, role)

    if (!emailResult.success) {
      return NextResponse.json(
        { message: emailResult.error || 'Failed to send verification email' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { message: 'Verification email sent successfully' },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Send verification error:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
