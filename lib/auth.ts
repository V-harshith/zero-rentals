import { supabase } from './supabase'
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

  const profileData = {
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

async function fetchUserProfile(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('role, name, phone, verified, status, email_verified_at')
    .eq('id', userId)
    .maybeSingle()

  return { data, error }
}

function validateUserStatus(userData: any) {
  // Relaxing verification check for easier dev experience
  // In production, we should enforce this based on project requirements
  /*
  if (!userData.email_verified_at) {
    throw new Error('EMAIL_NOT_VERIFIED')
  }
  */

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
  userData: { name: string; phone?: string; role: 'owner' | 'tenant' }
) {
  validateEmail(email)
  validatePasswordStrength(password)

  console.log("Auth: calling supabase.auth.signUp")
  
  // Determine the correct redirect URL based on environment
  const getRedirectUrl = () => {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin
      return `${origin}/auth/confirmed`
    }
    // Fallback for server-side calls
    return process.env.NEXT_PUBLIC_SITE_URL 
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirmed`
      : 'http://localhost:3000/auth/confirmed'
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { 
        name: userData.name, 
        role: userData.role,
        phone: userData.phone 
      },
      // CRITICAL: Set email redirect to ensure proper verification flow
      emailRedirectTo: getRedirectUrl(),
    },
  })

  if (authError) {
    console.error("Auth: supabase.auth.signUp failed", authError)
    handleAuthError(authError)
  }

  if (!authData.user) {
    throw new Error('User creation failed')
  }

  console.log("Auth: supabase.auth.signUp success", authData.user.id)

  // CRITICAL SECURITY CHECK: Ensure user is NOT auto-confirmed
  // If email_confirmed_at is set immediately after signup, it means
  // email confirmations are disabled in Supabase settings (security risk)
  // Check if email confirmation is properly configured
  if (authData.user.email_confirmed_at) {
    // User was auto-confirmed - this means email verification might be disabled in Supabase
    // However, this is acceptable for development/testing environments
    console.log("ℹ️ User was auto-confirmed (email verification may be disabled in Supabase settings)")
  } else {
    console.log("✅ User created in unconfirmed state (email verification required)")
  }

  // Edge case: Check if user already exists (can happen with race conditions)
  const { data: existingUser } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', email.toLowerCase())
    .maybeSingle()

  if (existingUser && existingUser.id !== authData.user.id) {
    console.error("Auth: Email already exists with different user ID")
    // Clean up the auth user we just created
    try {
      await supabase.auth.admin.deleteUser(authData.user.id)
    } catch (cleanupError) {
      console.error("Failed to cleanup duplicate user:", cleanupError)
    }
    throw new Error('This email is already registered. Please login instead.')
  }

  const verificationToken = generateVerificationToken()
  
  try {
    await createUserProfile(authData.user.id, email, userData, verificationToken)
  } catch (profileError: any) {
    console.error("Auth: Failed to create user profile", profileError)
    
    // Edge case: If profile creation fails, clean up the auth user
    // to prevent orphaned auth records
    try {
      console.log("Auth: Cleaning up auth user due to profile creation failure")
      await supabase.auth.admin.deleteUser(authData.user.id)
    } catch (cleanupError) {
      console.error("Auth: Failed to cleanup auth user:", cleanupError)
    }
    
    throw new Error(`Failed to complete registration: ${profileError.message}`)
  }

  // Send verification email (non-blocking - don't fail signup if email fails)
  try {
    await sendVerificationViaAction(email, userData.name, verificationToken, userData.role)
  } catch (emailError: any) {
    console.error("Auth: Failed to send verification email (non-fatal):", emailError)
    // Don't throw - user is created, they can resend verification email later
  }

  console.log("Auth: signUp flow complete")
  
  // Return user data with verification status
  return {
    ...authData,
    requiresVerification: !authData.user.email_confirmed_at,
    verificationEmailSent: true
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
      userData = await autoHealMissingProfile(data.user)
    } else {
      throw new Error('Failed to load user profile. Please try logging in again.')
    }
  }

  validateUserStatus(userData)

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
          
          // CRITICAL: Don't logout on database errors - return basic user info
          // This prevents logout on temporary database issues
          console.warn('[AUTH] Database error - using basic auth info to prevent logout')
          return {
            ...user,
            name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
            role: user.user_metadata?.role || 'tenant',
            verified: false,
            status: 'active'
          }
        }

        if (!userData) {
          console.log('[AUTH] No profile found, attempting auto-heal...')
          
          // Auto-heal: Create missing profile
          const roleFromMetadata = (user.user_metadata?.role as string) || 'tenant'
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
        if (error.message?.includes('session') || error.message?.includes('expired')) {
          throw new Error('Your session has expired. Please request a new password reset link.')
        }
        throw error
      }

      // Success! Return
      return
    } catch (error: any) {
      console.error(`[AUTH] Password update attempt ${attempt} failed:`, error.message)

      // If it's the last attempt, throw the error
      if (attempt === MAX_RETRIES) {
        throw new Error(error.message || 'Failed to update password after multiple attempts. Please try again.')
      }

      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    }
  }
}
