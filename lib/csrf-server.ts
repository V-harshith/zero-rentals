/**
 * CSRF Protection - Server Only
 * This file can only be imported in server components and API routes
 */

import { cookies } from 'next/headers'
import crypto from 'crypto'

const CSRF_COOKIE_NAME = 'csrf_token'
const CSRF_HEADER_NAME = 'x-csrf-token'

/**
 * Generate a CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Set CSRF token in cookie and return it
 */
export async function setCsrfToken(): Promise<string> {
  const token = generateCsrfToken()
  const cookieStore = await cookies()
  cookieStore.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 // 24 hours
  })
  return token
}

/**
 * Get CSRF token from cookie
 */
export async function getCsrfToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(CSRF_COOKIE_NAME)?.value
}

/**
 * Validate CSRF token from request header against cookie
 */
export async function validateCsrfToken(requestToken?: string | null): Promise<boolean> {
  if (!requestToken) return false
  const cookieToken = await getCsrfToken()
  if (!cookieToken) return false

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(requestToken, 'hex'),
      Buffer.from(cookieToken, 'hex')
    )
  } catch {
    return false
  }
}

/**
 * CSRF protection middleware for API routes
 * Returns error response if CSRF token is invalid
 */
export async function csrfProtection(request: Request): Promise<{ valid: boolean; error?: string }> {
  // Skip CSRF check for GET, HEAD, OPTIONS requests (they should be safe)
  const safeMethods = ['GET', 'HEAD', 'OPTIONS']
  if (safeMethods.includes(request.method)) {
    return { valid: true }
  }

  const csrfToken = request.headers.get(CSRF_HEADER_NAME)

  if (!csrfToken) {
    return { valid: false, error: 'CSRF token missing' }
  }

  const isValid = await validateCsrfToken(csrfToken)

  if (!isValid) {
    return { valid: false, error: 'Invalid CSRF token' }
  }

  return { valid: true }
}
