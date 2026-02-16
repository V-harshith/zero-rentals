import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const registerSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain uppercase letter')
    .regex(/[a-z]/, 'Password must contain lowercase letter')
    .regex(/[0-9]/, 'Password must contain number')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain special character'),
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  role: z.enum(['owner', 'tenant'], { message: 'Role must be owner or tenant' }),
  preferred_city: z.string().optional(),
  preferred_area: z.string().optional(),
})

// ============================================================================
// SERVICE CLIENT
// ============================================================================

/**
 * Create Supabase admin client with service role key.
 * This has elevated privileges and should ONLY be used server-side.
 */
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
// ATOMIC USER CREATION
// ============================================================================

interface UserCreationResult {
  success: boolean
  userId?: string
  error?: string
  code?: string
}

/**
 * Atomically create auth user and profile.
 * If profile creation fails, the auth user is rolled back.
 */
async function createUserAtomically(
  supabase: ReturnType<typeof createServiceClient>,
  data: z.infer<typeof registerSchema>
): Promise<UserCreationResult> {
  let authUserId: string | null = null

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Create auth user with metadata
    // -------------------------------------------------------------------------
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: data.email.toLowerCase(),
      password: data.password,
      email_confirm: false, // Require email verification
      user_metadata: {
        name: data.name,
        role: data.role,
        phone: data.phone || null,
      },
    })

    if (authError) {
      // Handle specific auth errors
      if (authError.message?.includes('already') || authError.message?.includes('registered')) {
        return {
          success: false,
          error: 'This email is already registered. Please login instead.',
          code: 'EMAIL_EXISTS',
        }
      }

      if (authError.message?.includes('weak') || authError.message?.includes('strength')) {
        return {
          success: false,
          error: 'Password is too weak. Please choose a stronger password.',
          code: 'WEAK_PASSWORD',
        }
      }

      return {
        success: false,
        error: `Failed to create account: ${authError.message}`,
        code: 'AUTH_ERROR',
      }
    }

    if (!authData.user) {
      return {
        success: false,
        error: 'User creation failed',
        code: 'AUTH_ERROR',
      }
    }

    authUserId = authData.user.id

    // -------------------------------------------------------------------------
    // STEP 2: Create user profile in database
    // -------------------------------------------------------------------------
    const profileData: Record<string, unknown> = {
      id: authUserId,
      email: data.email.toLowerCase(),
      name: data.name,
      phone: data.phone || null,
      role: data.role,
      verified: false,
      status: 'active',
      email_verified_at: null,
    }

    // Add tenant-specific fields
    if (data.role === 'tenant') {
      if (data.preferred_city) {
        profileData.preferred_city = data.preferred_city
      }
      if (data.preferred_area) {
        profileData.preferred_area = data.preferred_area
      }
    }

    const { error: profileError } = await supabase
      .from('users')
      .insert(profileData)

    if (profileError) {
      // CRITICAL: Profile creation failed - rollback auth user
      console.error('[REGISTER] Profile creation failed, rolling back auth user:', profileError)

      try {
        const { error: deleteError } = await supabase.auth.admin.deleteUser(authUserId)
        if (deleteError) {
          console.error('[REGISTER] Failed to rollback auth user:', deleteError)
          // Log for manual cleanup - auth user orphaned
          console.error('[REGISTER] ORPHANED AUTH USER:', {
            userId: authUserId,
            email: data.email,
            timestamp: new Date().toISOString(),
          })
        } else {
          console.log('[REGISTER] Auth user rolled back successfully')
        }
      } catch (rollbackError) {
        console.error('[REGISTER] Exception during rollback:', rollbackError)
      }

      return {
        success: false,
        error: 'Failed to create user profile. Registration has been cancelled.',
        code: 'PROFILE_ERROR',
      }
    }

    // -------------------------------------------------------------------------
    // STEP 3: Verify both records exist
    // -------------------------------------------------------------------------
    const { data: verifyProfile, error: verifyError } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', authUserId)
      .maybeSingle()

    if (verifyError || !verifyProfile) {
      console.error('[REGISTER] Verification failed:', verifyError)

      // Attempt rollback
      try {
        await supabase.auth.admin.deleteUser(authUserId)
      } catch (e) {
        console.error('[REGISTER] Failed to rollback after verification failure:', e)
      }

      return {
        success: false,
        error: 'Registration verification failed. Please try again.',
        code: 'VERIFICATION_ERROR',
      }
    }

    // Success - both records created
    return {
      success: true,
      userId: authUserId,
    }

  } catch (error: any) {
    // Unexpected error - attempt cleanup if we have an auth user ID
    if (authUserId) {
      try {
        await supabase.auth.admin.deleteUser(authUserId)
      } catch (e) {
        console.error('[REGISTER] Cleanup failed after exception:', e)
      }
    }

    console.error('[REGISTER] Unexpected error:', error)
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
    }
  }
}

// ============================================================================
// API HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
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

    const validationResult = registerSchema.safeParse(body)

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => e.message).join(', ')
      return NextResponse.json(
        { success: false, error: errors, code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const data = validationResult.data

    // -------------------------------------------------------------------------
    // Rate limiting check (simple IP-based)
    // -------------------------------------------------------------------------
    const ip = request.headers.get('x-forwarded-for') ||
               request.headers.get('x-real-ip') ||
               'unknown'

    // In production, use Redis or similar for distributed rate limiting
    // For now, we rely on Supabase's built-in rate limiting

    // -------------------------------------------------------------------------
    // Create service client and execute atomic creation
    // -------------------------------------------------------------------------
    const supabase = createServiceClient()
    const result = await createUserAtomically(supabase, data)

    if (!result.success) {
      const statusCode = result.code === 'EMAIL_EXISTS' ? 409 :
                        result.code === 'VALIDATION_ERROR' ? 400 :
                        result.code === 'WEAK_PASSWORD' ? 400 :
                        500

      return NextResponse.json(
        { success: false, error: result.error, code: result.code },
        { status: statusCode }
      )
    }

    // -------------------------------------------------------------------------
    // Send verification email (non-blocking)
    // -------------------------------------------------------------------------
    // Note: Supabase automatically sends a verification email when using
    // auth.admin.createUser with email_confirm: false. We don't need to
    // manually trigger it. The custom verification email is handled by
    // the client-side sendVerificationViaAction function in lib/auth.ts

    // -------------------------------------------------------------------------
    // Return success response
    // -------------------------------------------------------------------------
    return NextResponse.json({
      success: true,
      userId: result.userId,
      message: 'Account created successfully. Please check your email to verify your account.',
      requiresVerification: true,
    }, { status: 201 })

  } catch (error: any) {
    console.error('[REGISTER] Unhandled exception:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
