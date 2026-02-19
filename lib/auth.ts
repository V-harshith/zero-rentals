import { supabase } from './supabase'
import { supabaseAdmin } from './supabase-admin'
import { generateVerificationToken, getTokenExpiry } from './verification-utils'
import { checkRateLimit, maskUserId, sanitizeForLog } from './security-utils'

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================

/**
 * Hardcoded list of admin emails for security.
 * Only these emails can be granted admin role during profile auto-healing.
 * To add admins, update this list or use ADMIN_EMAILS environment variable.
 */
const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || [
  // Add your admin emails here
  // 'admin@zerorentals.com',
]

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

function validateEmail(email: string) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    throw new Error('Please enter a valid email address')
  }
}

function validatePasswordStrength(password: string) {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long')
  }

  const hasUppercase = /[A-Z]/.test(password)
  const hasLowercase = /[a-z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password)

  if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
    throw new Error('Password must contain uppercase, lowercase, number, and special character')
  }
}

function handleAuthError(error: any): never {
  if (error.message.includes('invalid') || error.message.includes('not allowed')) {
    throw new Error('This email address cannot be used. Please try a different email.')
  }
  if (error.message.includes('already') || error.message.includes('registered')) {
    throw new Error('This email is already registered. Please login instead.')
  }
  if (error.message.includes('rate limit')) {
    throw new Error('Too many signup attempts. Please try again in a few minutes.')
  }
  throw new Error(error.message || 'Failed to create account. Please try again.')
}

// ============================================================================
// USER PROFILE HELPERS
// ============================================================================

async function createUserProfile(userId: string, email: string, userData: any, verificationToken: string) {
  const tokenExpiresAt = getTokenExpiry()

  const profileData: any = {
    id: userId,
    email,
    name: userData.name,
    phone: userData.phone || null,
    role: userData.role,
    verified: false,
    status: 'active',
    verification_token: verificationToken,
    token_expires_at: tokenExpiresAt.toISOString(),
    email_verified_at: null,
  }

  // Add tenant-specific fields
  if (userData.role === 'tenant') {
    if (userData.preferred_city) {
      profileData.preferred_city = userData.preferred_city
    }
    if (userData.preferred_area) {
      profileData.preferred_area = userData.preferred_area
    }
  }



  // Retry logic for profile creation to handle race conditions/aborts
  let attempts = 0
  const maxAttempts = 3

  while (attempts < maxAttempts) {
    try {
      const { data, error } = await supabase
        .from('users')
        .upsert(profileData, { onConflict: 'id' })
        .select()

      if (error) {
        // Database error - log and throw
        console.error('User record creation failed:', JSON.stringify(error, null, 2))
        throw new Error(`Failed to create user profile: ${error.message}`)
      }

      return // Success
    } catch (error: any) {
      // Handle AbortError or network errors by retrying
      if (error.name === 'AbortError' || error.message?.includes('aborted') || error.message?.includes('fetch')) {
        attempts++
        if (attempts < maxAttempts) {
          console.warn(`Profile creation attempt ${attempts} failed (retrying):`, error.message)
          await new Promise(resolve => setTimeout(resolve, 500 * attempts)) // Backoff
          continue
        }
      }

      // If we ran out of retries or it's a different error
      console.error('User record creation failed:', JSON.stringify(error, null, 2))
      throw new Error(`Failed to create user profile: ${error.message}`)
    }
  }

  // Fallback: If loop exits without returning, throw error
  throw new Error('Failed to create user profile: Maximum retry attempts exceeded')
}

async function sendVerificationViaAction(email: string, name: string, token: string, role?: 'owner' | 'tenant') {
  try {
    console.log("Auth: Importing email action...")
    const { sendVerificationEmailAction } = await import('@/app/actions/auth-actions')
    console.log("Auth: Sending email...")
    const result = await sendVerificationEmailAction(email, name, token, role)

    if (result.success) {
      console.log(`Verification email sent to: ${email}`)
    } else {
      console.warn('Failed to send verification email (Server Action):', result.error)
    }
  } catch (emailError) {
    console.error('Failed to invoke email server action:', emailError)
  }
}

async function autoHealMissingProfile(authUser: any) {
  console.log("Auth: User missing in public table, attempting to create...")
  const meta = authUser.user_metadata
  const userEmail = authUser.email?.toLowerCase() || ''

  // ✅ SECURITY: Determine role securely - never trust user_metadata for admin role
  let role: 'admin' | 'owner' | 'tenant' = 'tenant'

  if (ADMIN_EMAILS.includes(userEmail)) {
    // Only whitelisted emails can be admin
    role = 'admin'
    console.warn('[SECURITY] Admin profile auto-created:', {
      email: authUser.email,
      id: authUser.id,
      timestamp: new Date().toISOString()
    })
  } else if (meta?.role === 'owner') {
    // Allow owner role from metadata (less sensitive than admin)
    role = 'owner'
  }
  // All other cases default to 'tenant'

  const { data: newUser, error: createError } = await supabase
    .from('users')
    .upsert({
      id: authUser.id,
      email: authUser.email!,
      name: meta?.name || authUser.email?.split('@')[0] || 'User',
      role: role, // ✅ SECURE: Role determined by server-side logic
      phone: meta?.phone,
      status: 'active',
      verified: false,
      email_verified_at: authUser.email_confirmed_at || null
    }, { onConflict: 'id' })
    .select()
    .maybeSingle()

  if (createError) {
    console.error("Auth: Failed to auto-create user", createError)
    throw new Error("Account data missing and could not be restored.")
  }

  console.log("Auth: Profile restored", newUser)
  return newUser
}

async function fetchUserProfile(userId: string, retryCount = 0): Promise<{ data: any; error: any }> {
  const { data, error } = await supabase
    .from('users')
    .select('role, name, phone, verified, status, email_verified_at')
    .eq('id', userId)
    .maybeSingle()

  // Handle race condition: if no data found but this is first attempt, retry after delay
  // This handles database replication lag after auto-heal
  if (!data && !error && retryCount < 2) {
    await new Promise(resolve => setTimeout(resolve, 300 * (retryCount + 1)))
    return fetchUserProfile(userId, retryCount + 1)
  }

  return { data, error }
}

function validateUserStatus(userData: any, emailConfirmedAt?: string | null) {
  // Enforce email verification check
  // Use Supabase Auth's email_confirmed_at as source of truth, fall back to database
  const isEmailVerified = emailConfirmedAt || userData.email_verified_at

  if (!isEmailVerified) {
    throw new Error('EMAIL_NOT_VERIFIED')
  }

  if (userData.status !== 'active') {
    throw new Error('Your account has been suspended. Please contact support.')
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function signUp(
  email: string,
  password: string,
  userData: {
    name: string;
    phone?: string;
    role: 'owner' | 'tenant';
    preferred_city?: string | null;
    preferred_area?: string | null;
  },
  csrfToken: string
) {
  validateEmail(email)
  validatePasswordStrength(password)

  console.log("Auth: calling atomic registration API")

  // ---------------------------------------------------------------------------
  // ATOMIC USER CREATION via Server API
  // ---------------------------------------------------------------------------
  // The registration API handles both auth user and profile creation atomically.
  // If profile creation fails, the auth user is rolled back automatically.
  // This prevents orphaned auth records.
  // ---------------------------------------------------------------------------

  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify({
      email,
      password,
      name: userData.name,
      phone: userData.phone,
      role: userData.role,
      preferred_city: userData.preferred_city,
      preferred_area: userData.preferred_area,
    }),
  })

  const result = await response.json()

  if (!response.ok || !result.success) {
    console.error("Auth: Registration API failed:", result)

    // Handle specific error codes
    if (result.code === 'EMAIL_EXISTS') {
      throw new Error('This email is already registered. Please login instead.')
    }

    if (result.code === 'WEAK_PASSWORD') {
      throw new Error('Password is too weak. Please choose a stronger password.')
    }

    if (result.code === 'VALIDATION_ERROR') {
      throw new Error(result.error || 'Invalid registration data')
    }

    // Generic error
    throw new Error(result.error || 'Failed to create account. Please try again.')
  }

  console.log("Auth: Registration successful, userId:", result.userId)

  // Generate and save verification token
  const verificationToken = generateVerificationToken()
  const tokenExpiresAt = getTokenExpiry()

  // CRITICAL: Save token to database before sending email
  const { error: tokenUpdateError } = await supabaseAdmin
    .from('users')
    .update({
      verification_token: verificationToken,
      token_expires_at: tokenExpiresAt.toISOString(),
    })
    .eq('id', result.userId)

  if (tokenUpdateError) {
    console.error("Auth: Failed to save verification token:", tokenUpdateError)
    // Don't fail registration, but log for manual intervention
    // User can resend verification email which will generate a new token
  }

  // Send verification email via server action (non-blocking)
  // The API already triggers Supabase's verification email, but we also
  // send our custom verification email for consistency
  try {
    await sendVerificationViaAction(email, userData.name, verificationToken, userData.role)
  } catch (emailError: any) {
    console.error("Auth: Failed to send custom verification email (non-fatal):", emailError)
    // Don't throw - user is created, they can resend verification email later
  }

  console.log("Auth: signUp flow complete")

  // Return user data with verification status
  return {
    user: { id: result.userId, email },
    requiresVerification: result.requiresVerification ?? true,
    verificationEmailSent: true,
  }
}


export async function signIn(email: string, password: string) {
  // SECURITY: Rate limiting - prevent brute force attacks
  const rateLimitKey = `signin:${email.toLowerCase()}`
  const rateLimit = checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000) // 5 attempts per 15 minutes

  if (!rateLimit.allowed) {
    throw new Error('Too many login attempts. Please try again later.')
  }

  // CRITICAL: Clear any existing session before logging in
  // This prevents cross-role login issues
  try {
    await supabase.auth.signOut()
  } catch (error) {
    // Non-fatal error, continue with sign in
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    
    // Provide user-friendly error messages
    if (error.message.includes('Invalid login credentials')) {
      throw new Error('Invalid email or password. Please check your credentials and try again.')
    }
    
    if (error.message.includes('Email not confirmed')) {
      // Create a custom error with additional context
      const verificationError = new Error('EMAIL_NOT_VERIFIED')
      verificationError.message = 'Please verify your email before logging in. Check your inbox for the verification link.'
      throw verificationError
    }
    
    if (error.message.includes('too many requests') || error.message.includes('rate limit')) {
      throw new Error('Too many login attempts. Please try again in a few minutes.')
    }
    
    throw error
  }

  if (!data.user) {
    throw new Error('Login failed')
  }
  
  // CRITICAL: Enforce email verification on login
  // This is the primary defense against unverified account access
  if (!data.user.email_confirmed_at) {
    console.warn(`Auth: Blocking login for unverified user: ${data.user.email}`)
    
    // Sign out the unverified user immediately
    await supabase.auth.signOut()
    
    // Create a custom error that the UI can handle specially
    const verificationError: any = new Error('EMAIL_NOT_VERIFIED')
    verificationError.email = data.user.email
    verificationError.userId = data.user.id
    verificationError.message = 'Please verify your email before logging in. Check your inbox for the verification link.'
    
    throw verificationError
  }
  
  let { data: userData, error: userError } = await fetchUserProfile(data.user.id)

  if (userError || !userData) {
    if (!userData) {
      // Attempt to auto-heal missing profile
      userData = await autoHealMissingProfile(data.user)
      // Retry fetching after auto-heal to ensure data is committed
      if (userData) {
        const { data: refetchedData } = await fetchUserProfile(data.user.id, 1)
        if (refetchedData) {
          userData = refetchedData
        }
      }
    } else {
      throw new Error('Failed to load user profile. Please try logging in again.')
    }
  }

  if (!userData) {
    throw new Error('User profile not found. Please contact support if this issue persists.')
  }

  validateUserStatus(userData, data.user.email_confirmed_at)

  return { ...data, userData }
}


export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getCurrentUser() {
  const MAX_RETRIES = 3
  const TIMEOUT_MS = 30000 // 30 seconds for slower connections
  let attempt = 0

  // Wrap entire operation in a timeout
  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => {
      console.warn(`[AUTH] getCurrentUser: Operation timed out after ${TIMEOUT_MS / 1000}s`)
      resolve(null)
    }, TIMEOUT_MS)
  })

  const getUserPromise = async (): Promise<any> => {
    while (attempt <= MAX_RETRIES) {
      try {
        // CRITICAL FIX: First check getSession() for faster local validation
        // Then use getUser() for server-side validation if needed
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        // If no session exists locally, return null immediately
        if (!sessionError && !session) {
          console.log("[AUTH] No local session found")
          return null
        }

        // Use getUser() for server-side validation
        const { data: { user }, error: userError } = await supabase.auth.getUser()

        if (userError) {
          console.warn("[AUTH] User error:", userError.message)
          
          // If it's an auth error (invalid token), return null
          if (userError.status === 401 || userError.status === 403) {
            console.log("[AUTH] Invalid session, user not authenticated")
            return null
          }

          // Network error - retry with exponential backoff if we have attempts left
        if (attempt < MAX_RETRIES &&
            (userError.message?.includes("fetch") ||
             userError.message?.includes("network") ||
             userError.message?.includes("timeout") ||
             userError.message?.includes("aborted"))) {
          attempt++
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000) // Exponential backoff: 2s, 4s, 8s max
          console.log(`[AUTH] Network error, retrying with exponential backoff... (${attempt}/${MAX_RETRIES}, ${backoffMs}ms)`)
          await new Promise(resolve => setTimeout(resolve, backoffMs))
          continue
        }

          return null
        }

        if (!user) {
          console.log("[AUTH] No user found")
          return null
        }

        console.log("[AUTH] User authenticated:", user.email)

        // CRITICAL: Enforce email verification
        // Users who haven't verified their email cannot access the app
        if (!user.email_confirmed_at) {
          console.log("[AUTH] Email not verified, blocking access for:", user.email)
          return null
        }

        // 2. Fetch user profile from database (with retry logic)
        let profileAttempt = 0
        const MAX_PROFILE_RETRIES = 2
        let userData = null
        let profileError = null

        while (profileAttempt <= MAX_PROFILE_RETRIES) {
          try {
            const { data, error } = await supabase
              .from('users')
              .select('*')
              .eq('id', user.id)
              .maybeSingle()

            profileError = error
            userData = data

            if (!error) break // Success

            // Retry on network/timeout errors
            if (profileAttempt < MAX_PROFILE_RETRIES && 
                (error.message?.includes("fetch") || 
                 error.message?.includes("timeout") ||
                 error.message?.includes("network"))) {
              profileAttempt++
              console.log(`[AUTH] Profile fetch error, retrying... (${profileAttempt}/${MAX_PROFILE_RETRIES})`)
              await new Promise(resolve => setTimeout(resolve, 500 * profileAttempt))
              continue
            }

            break // Non-retryable error or max retries reached
          } catch (err: any) {
            profileError = err
            if (profileAttempt < MAX_PROFILE_RETRIES) {
              profileAttempt++
              console.log(`[AUTH] Profile fetch exception, retrying... (${profileAttempt}/${MAX_PROFILE_RETRIES})`)
              await new Promise(resolve => setTimeout(resolve, 500 * profileAttempt))
              continue
            }
            break
          }
        }

        // Handle profile fetch results
        if (profileError) {
          console.error('[AUTH] Error fetching user profile after retries:', profileError)

          // CRITICAL FIX: Never trust user_metadata for role - always default to tenant
          // User metadata can be manipulated client-side, creating privilege escalation risk
          console.warn('[AUTH] Database error - using basic auth info with safe defaults')
          return {
            ...user,
            name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
            role: 'tenant', // SECURITY: Always default to tenant, never trust metadata
            verified: false,
            status: 'active'
          }
        }

        if (!userData) {
          console.log('[AUTH] No profile found, attempting auto-heal...')

          // Auto-heal: Create missing profile
          // SECURITY FIX: Never trust user_metadata for role - always default to tenant
          const roleFromMetadata = 'tenant' // Never use user.user_metadata?.role
          const nameFromMetadata = (user.user_metadata?.name as string) || user.email!.split('@')[0]

          const { data: newUserData, error: insertError } = await supabase
            .from('users')
            .upsert({
              id: user.id,
              email: user.email!,
              name: nameFromMetadata,
              role: roleFromMetadata,
              verified: false,
              status: 'active',
              email_verified_at: user.email_confirmed_at || null
            }, { onConflict: 'id' })
            .select()
            .maybeSingle()

          if (insertError || !newUserData) {
            console.error('[AUTH] Failed to create profile:', insertError)
            // Return basic info instead of null
            return {
              ...user,
              name: nameFromMetadata,
              role: roleFromMetadata,
              verified: false,
              status: 'active'
            }
          }

          console.log('[AUTH] Profile auto-healed successfully')
          return { ...user, ...newUserData }
        }

        // Success - return complete user object
        console.log('[AUTH] User loaded successfully:', userData.email)
        return { ...user, ...userData }

      } catch (error: any) {
        // Handle AbortError
        if (error.name === 'AbortError') {
          console.warn('[AUTH] Request was aborted')
          return null
        }

        // Network error - retry with exponential backoff if we have attempts left
        if (attempt < MAX_RETRIES &&
            (error.message?.includes("Failed to fetch") ||
             error.message?.includes("Network") ||
             error.message?.includes("fetch") ||
             error.message?.includes("timeout") ||
             error.message?.includes("aborted"))) {
          attempt++
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000) // Exponential backoff: 2s, 4s, 8s max
          console.log(`[AUTH] Network error, retrying with exponential backoff... (${attempt}/${MAX_RETRIES}, ${backoffMs}ms)`)
          await new Promise(resolve => setTimeout(resolve, backoffMs))
          continue
        }

        console.error('[AUTH] Unexpected error in getCurrentUser:', error)
        return null
      }
    }

    console.error('[AUTH] Max retries exhausted')
    return null
  }

  // Race between timeout and actual operation
  const result = await Promise.race([getUserPromise(), timeoutPromise])
  return result
}






export async function resetPassword(email: string) {
  // Use env variable or production URL - fixes "Invalid or expired reset link" error
  // This ensures redirectTo is always set (not undefined on server-side)
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://zerorentals.vercel.app'
  const redirectTo = `${baseUrl}/reset-password`
  
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  })
  if (error) throw error
}

export async function updatePassword(newPassword: string) {
  const MAX_RETRIES = 3
  const TIMEOUT_MS = 15000 // 15 second timeout

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Password update timed out. Please try again.')), TIMEOUT_MS)
      })

      // Create the update promise
      const updatePromise = supabase.auth.updateUser({ password: newPassword })

      // Race between timeout and actual operation
      const { error } = await Promise.race([updatePromise, timeoutPromise])

      if (error) {
        // Check for specific error types that shouldn't be retried
        if (error.message?.includes('session') || error.message?.includes('expired') || error.status === 401) {
          throw new Error('Your session has expired. Please request a new password reset link.')
        }
        if (error.message?.includes('weak') || error.message?.includes('strength')) {
          throw new Error('Password is too weak. Please choose a stronger password.')
        }
        if (error.message?.includes('same password') || error.message?.includes('different')) {
          throw new Error('New password must be different from your current password.')
        }
        throw error
      }

      // Success! Return
      return
    } catch (error: any) {
      // Don't log on final attempt - let caller handle it
      if (attempt < MAX_RETRIES) {
        // Check for non-retryable errors
        if (error.message?.includes('session') ||
            error.message?.includes('expired') ||
            error.message?.includes('weak') ||
            error.message?.includes('same password')) {
          throw error
        }
      }

      // If it's the last attempt, throw the error
      if (attempt === MAX_RETRIES) {
        throw new Error(error.message || 'Failed to update password after multiple attempts. Please try again.')
      }

      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    }
  }
}
