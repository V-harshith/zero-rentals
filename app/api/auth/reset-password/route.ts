import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { csrfProtection } from '@/lib/csrf-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { createClient } from '@supabase/supabase-js'

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const resetPasswordSchema = z.object({
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain uppercase letter')
    .regex(/[a-z]/, 'Password must contain lowercase letter')
    .regex(/[0-9]/, 'Password must contain number')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain special character'),
})

// ============================================================================
// SERVICE CLIENT
// ============================================================================

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase configuration')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
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
    // Rate Limiting
    // -------------------------------------------------------------------------
    const rateLimit = await checkRateLimit(request, 'reset-password', 5, 60000) // 5 req/min per IP
    if (rateLimit.limited) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429, headers: rateLimit.headers }
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

    const validationResult = resetPasswordSchema.safeParse(body)
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => e.message).join(', ')
      return NextResponse.json(
        { success: false, error: errors },
        { status: 400 }
      )
    }

    const { password } = validationResult.data

    // -------------------------------------------------------------------------
    // Get access token from Authorization header
    // The client should send the Supabase access token from the recovery session
    // -------------------------------------------------------------------------
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const accessToken = authHeader.substring(7)

    // -------------------------------------------------------------------------
    // Verify the token and update password using Supabase Auth
    // -------------------------------------------------------------------------
    const supabase = createServiceClient()

    // Verify the token by getting the user
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)

    if (userError || !userData.user) {
      console.error('[RESET_PASSWORD] Invalid or expired token:', userError?.message)
      return NextResponse.json(
        { success: false, error: 'Invalid or expired reset token. Please request a new password reset.' },
        { status: 401 }
      )
    }

    // Update the user's password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      userData.user.id,
      { password }
    )

    if (updateError) {
      console.error('[RESET_PASSWORD] Password update error:', updateError.message)

      if (updateError.message?.includes('weak') || updateError.message?.includes('strength')) {
        return NextResponse.json(
          { success: false, error: 'Password is too weak. Please choose a stronger password.' },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { success: false, error: 'Failed to update password. Please try again.' },
        { status: 500 }
      )
    }

    console.log(`[RESET_PASSWORD] Password updated successfully for user: ${userData.user.id}`)

    return NextResponse.json(
      { success: true, message: 'Password updated successfully. Please log in with your new password.' },
      { status: 200 }
    )

  } catch (error: any) {
    console.error('[RESET_PASSWORD] Unhandled exception:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
