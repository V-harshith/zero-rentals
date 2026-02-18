import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { csrfProtection } from '@/lib/csrf-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendPasswordResetEmail } from '@/lib/email-service'

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

// ============================================================================
// RATE LIMIT CONFIGURATION
// ============================================================================

const RATE_LIMIT_MAX = 3 // 3 requests per hour per email
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour

// In-memory store for email-based rate limiting
const emailRateLimits = new Map<string, { count: number; lastReset: number }>()

/**
 * Check rate limit for email-based requests
 */
async function checkEmailRateLimit(email: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = Date.now()
  const record = emailRateLimits.get(email)

  if (!record || now - record.lastReset > RATE_LIMIT_WINDOW_MS) {
    emailRateLimits.set(email, { count: 1, lastReset: now })
    return { allowed: true }
  }

  if (record.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((record.lastReset + RATE_LIMIT_WINDOW_MS - now) / 1000)
    return { allowed: false, retryAfter }
  }

  record.count += 1
  return { allowed: true }
}

// ============================================================================
// API HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // -------------------------------------------------------------------------
    // CSRF Protection
    // -------------------------------------------------------------------------
    const csrfResult = await csrfProtection(request)
    if (!csrfResult.valid) {
      return NextResponse.json(
        { success: false, error: csrfResult.error || 'Invalid CSRF token' },
        { status: 403 }
      )
    }

    // -------------------------------------------------------------------------
    // IP-based Rate Limiting
    // -------------------------------------------------------------------------
    const ipLimit = await checkRateLimit(request, 'forgot-password', 10, 60000) // 10 req/min per IP
    if (ipLimit.limited) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429, headers: ipLimit.headers }
      )
    }

    // -------------------------------------------------------------------------
    // Parse and validate request body
    // -------------------------------------------------------------------------
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const validationResult = forgotPasswordSchema.safeParse(body)
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => e.message).join(', ')
      return NextResponse.json(
        { success: false, error: errors },
        { status: 400 }
      )
    }

    const { email } = validationResult.data
    const normalizedEmail = email.toLowerCase().trim()

    // -------------------------------------------------------------------------
    // Email-based Rate Limiting (3 per hour per email)
    // -------------------------------------------------------------------------
    const emailLimit = await checkEmailRateLimit(normalizedEmail)
    if (!emailLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many requests for this email. Please try again in ${Math.ceil(emailLimit.retryAfter! / 60)} minutes.`
        },
        {
          status: 429,
          headers: {
            'Retry-After': emailLimit.retryAfter!.toString()
          }
        }
      )
    }

    // -------------------------------------------------------------------------
    // Check if user exists (without revealing this information)
    // -------------------------------------------------------------------------
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('name')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (userError) {
      console.error('[FORGOT_PASSWORD] Database error:', userError.message)
      // Still return success to prevent user enumeration
      return NextResponse.json(
        { success: true, message: 'If an account exists, a reset email has been sent.' },
        { status: 200 }
      )
    }

    // SECURITY: If user doesn't exist, still return success to prevent email enumeration
    if (!user) {
      console.log(`[FORGOT_PASSWORD] Email not found: ${normalizedEmail}`)
      return NextResponse.json(
        { success: true, message: 'If an account exists, a reset email has been sent.' },
        { status: 200 }
      )
    }

    // -------------------------------------------------------------------------
    // Generate recovery link
    // -------------------------------------------------------------------------
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: normalizedEmail,
      options: {
        redirectTo: `${baseUrl}/auth/reset-password`
      }
    })

    if (linkError) {
      console.error('[FORGOT_PASSWORD] Generate link error:', linkError.message)
      return NextResponse.json(
        { success: false, error: 'Failed to generate reset link. Please try again later.' },
        { status: 500 }
      )
    }

    // -------------------------------------------------------------------------
    // Send password reset email
    // -------------------------------------------------------------------------
    if (data?.properties?.action_link) {
      await sendPasswordResetEmail(normalizedEmail, user.name, data.properties.action_link)
      console.log(`[FORGOT_PASSWORD] Email sent successfully to: ${normalizedEmail}`)
    } else {
      console.error('[FORGOT_PASSWORD] No action_link in response')
      return NextResponse.json(
        { success: false, error: 'Failed to create reset link. Please try again later.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, message: 'If an account exists, a reset email has been sent.' },
      { status: 200 }
    )

  } catch (error: any) {
    console.error('[FORGOT_PASSWORD] Unhandled exception:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
