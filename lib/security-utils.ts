/**
 * Security Utilities
 *
 * This module provides security-related utilities for the application.
 * All sanitization, validation, and security transformations go here.
 */

/**
 * Escape HTML special characters to prevent XSS attacks
 * Use this when inserting untrusted data into HTML content
 */
export function escapeHtml(unsafe: string): string {
  if (!unsafe) return ''

  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

/**
 * Sanitize user input for display in HTML contexts
 * This is a more aggressive sanitization for user-generated content
 */
export function sanitizeHtml(input: string): string {
  if (!input) return ''

  // First escape HTML
  let sanitized = escapeHtml(input)

  // Remove potentially dangerous protocols
  sanitized = sanitized.replace(/javascript:/gi, '')
  sanitized = sanitized.replace(/data:/gi, '')
  sanitized = sanitized.replace(/vbscript:/gi, '')

  return sanitized
}

/**
 * Validate and sanitize email addresses
 */
export function sanitizeEmail(email: string): string {
  if (!email) return ''

  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const trimmed = email.trim().toLowerCase()

  return emailRegex.test(trimmed) ? trimmed : ''
}

/**
 * Sanitize user input for logging (remove PII)
 * Use this when logging user data to prevent PII exposure
 */
export function sanitizeForLog(value: string): string {
  if (!value) return ''

  // Truncate long strings
  if (value.length > 100) {
    return value.substring(0, 100) + '... [truncated]'
  }

  return value
}

/**
 * Create a safe user ID for logging (show only first/last few chars)
 */
export function maskUserId(userId: string): string {
  if (!userId || userId.length < 8) return '[hidden]'
  return `${userId.substring(0, 4)}...${userId.substring(userId.length - 4)}`
}

/**
 * Rate limiting storage (in-memory, per-instance)
 * For production, use Redis or database-backed rate limiting
 */
interface RateLimitEntry {
  count: number
  resetTime: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

/**
 * Check if a request should be rate limited
 * @param identifier - Unique identifier (IP address, user ID, etc.)
 * @param maxRequests - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns Object with allowed status and remaining requests
 */
export function checkRateLimit(
  identifier: string,
  maxRequests: number = 5,
  windowMs: number = 15 * 60 * 1000 // 15 minutes
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now()
  const key = identifier

  const entry = rateLimitStore.get(key)

  // If no entry exists or window has expired, create new entry
  if (!entry || now > entry.resetTime) {
    const resetTime = now + windowMs
    rateLimitStore.set(key, {
      count: 1,
      resetTime
    })
    return { allowed: true, remaining: maxRequests - 1, resetTime }
  }

  // Increment count
  entry.count++

  // Check if limit exceeded
  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetTime: entry.resetTime }
  }

  return { allowed: true, remaining: maxRequests - entry.count, resetTime: entry.resetTime }
}

/**
 * Clear expired rate limit entries (call periodically)
 */
export function cleanupRateLimits(): void {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}

// Clean up rate limits every hour
if (typeof window === 'undefined') {
  setInterval(cleanupRateLimits, 60 * 60 * 1000)
}
