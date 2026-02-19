/**
 * Database-backed rate limiter for production use on Vercel/Serverless.
 * Uses Supabase PostgreSQL stored procedures for atomic operations.
 *
 * FALLBACK: Falls back to in-memory rate limiting ONLY in development
 * or when database is unavailable. In production, database failures
 * result in blocked requests (fail-closed security model).
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from './supabase-admin'

// Local fallback for development only
const localRateLimits = new Map<string, { count: number; lastReset: number }>()
const MAX_LOCAL_ENTRIES = 1000
const MAX_RETRIES = 3

interface RateLimitResult {
    limited: boolean
    headers?: Record<string, string>
}

/**
 * Get client IP from request headers
 * Uses x-real-ip first (set by trusted proxy), falls back to x-forwarded-for
 * Takes the LAST IP in x-forwarded-for (closest to server) to prevent spoofing
 */
function getClientIP(request: NextRequest): string {
    // Trust x-real-ip first (set by your proxy/LB)
    const realIP = request.headers.get('x-real-ip')
    if (realIP) return realIP

    // x-forwarded-for can be spoofed - only trust the LAST entry
    // (added by your proxy, closest to your server)
    const forwarded = request.headers.get('x-forwarded-for')
    if (forwarded) {
        const ips = forwarded.split(',').map(s => s.trim()).filter(Boolean)
        // Return the LAST IP (closest to server), not the first
        const lastIP = ips[ips.length - 1]
        if (lastIP) return lastIP
    }

    return 'unknown'
}

/**
 * Check rate limit using database stored procedure
 * Uses atomic UPSERT to prevent race conditions
 */
async function checkDatabaseRateLimit(
    identifier: string,
    limit: number,
    windowMs: number,
    retryCount: number = 0
): Promise<{ allowed: boolean; remaining: number; resetAfter: number; error?: string }> {
    // Use UTC for consistent window calculation across servers
    const now = Date.now()
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs).toISOString()

    try {
        // Call the atomic stored procedure
        const { data, error } = await supabaseAdmin
            .rpc('check_rate_limit', {
                p_identifier: identifier,
                p_window_start: windowStart,
                p_limit: limit,
                p_window_ms: windowMs
            })

        if (error) {
            throw error
        }

        if (!data || data.length === 0) {
            throw new Error('No response from rate limit check')
        }

        const result = data[0]
        return {
            allowed: result.allowed,
            remaining: result.remaining,
            resetAfter: Math.max(0, result.reset_after_seconds)
        }

    } catch (error) {
        console.error('[rate-limit] Database error:', error)

        // Retry on transient errors
        if (retryCount < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 100 * (retryCount + 1)))
            return checkDatabaseRateLimit(identifier, limit, windowMs, retryCount + 1)
        }

        return {
            allowed: false, // FAIL CLOSED - block on error
            remaining: 0,
            resetAfter: Math.ceil(windowMs / 1000),
            error: 'Rate limit service unavailable'
        }
    }
}

/**
 * Fallback in-memory rate limiter for development only
 */
function checkLocalRateLimit(
    identifier: string,
    limit: number,
    windowMs: number
): { allowed: boolean; remaining: number; resetAfter: number } {
    const now = Date.now()

    // LRU eviction if map is full
    if (localRateLimits.size >= MAX_LOCAL_ENTRIES && !localRateLimits.has(identifier)) {
        const firstKey = localRateLimits.keys().next().value
        if (firstKey) {
            localRateLimits.delete(firstKey)
        }
    }

    const record = localRateLimits.get(identifier)

    if (!record || now - record.lastReset > windowMs) {
        localRateLimits.set(identifier, { count: 1, lastReset: now })
        return { allowed: true, remaining: limit - 1, resetAfter: Math.ceil(windowMs / 1000) }
    }

    if (record.count >= limit) {
        const resetAfter = Math.ceil((record.lastReset + windowMs - now) / 1000)
        return { allowed: false, remaining: 0, resetAfter: Math.max(0, resetAfter) }
    }

    record.count += 1
    const resetAfter = Math.ceil((record.lastReset + windowMs - now) / 1000)
    return { allowed: true, remaining: limit - record.count, resetAfter: Math.max(0, resetAfter) }
}

/**
 * Check rate limit for a request
 * Uses database for distributed rate limiting across serverless instances
 *
 * SECURITY: Always fails closed (blocks request) if rate limit cannot be determined
 */
export async function checkRateLimit(
    request: NextRequest,
    action: string,
    limit: number = 30,
    windowMs: number = 60000
): Promise<RateLimitResult> {
    const ip = getClientIP(request)
    const identifier = `${ip}:${action}`

    const result = await checkDatabaseRateLimit(identifier, limit, windowMs)

    // Handle error case - fail closed for security
    if (result.error) {
        // In production, block the request
        // In development, use fallback with warning header
        const isDevelopment = process.env.NODE_ENV === 'development'

        if (isDevelopment) {
            const fallback = checkLocalRateLimit(identifier, limit, windowMs)
            return {
                limited: !fallback.allowed,
                headers: {
                    'X-RateLimit-Limit': limit.toString(),
                    'X-RateLimit-Remaining': fallback.remaining.toString(),
                    'X-RateLimit-Reset': (Math.floor(Date.now() / 1000) + fallback.resetAfter).toString(),
                    'X-RateLimit-Fallback': 'memory',
                    'Warning': '199 - Rate limit using fallback'
                }
            }
        }

        // Production: fail closed
        return {
            limited: true,
            headers: {
                'X-RateLimit-Limit': limit.toString(),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': (Math.floor(Date.now() / 1000) + result.resetAfter).toString(),
                'Retry-After': result.resetAfter.toString(),
                'X-RateLimit-Error': 'service_unavailable'
            }
        }
    }

    // Normal response
    if (!result.allowed) {
        return {
            limited: true,
            headers: {
                'X-RateLimit-Limit': limit.toString(),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': (Math.floor(Date.now() / 1000) + result.resetAfter).toString(),
                'Retry-After': result.resetAfter.toString()
            }
        }
    }

    return {
        limited: false,
        headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': result.remaining.toString(),
            'X-RateLimit-Reset': (Math.floor(Date.now() / 1000) + result.resetAfter).toString()
        }
    }
}

/**
 * Legacy rateLimit function for backward compatibility
 * Now uses database-backed implementation
 */
export async function rateLimit(
    identifier: string,
    limit: number = 5,
    windowMs: number = 60000
): Promise<{ success: boolean; remaining: number }> {
    const result = await checkDatabaseRateLimit(identifier, limit, windowMs)

    if (result.error) {
        // Fail closed - treat error as rate limit exceeded
        return { success: false, remaining: 0 }
    }

    return { success: result.allowed, remaining: result.remaining }
}

// Cleanup interval for local fallback (development only)
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now()
        for (const [key, record] of localRateLimits.entries()) {
            if (now - record.lastReset > 3600000) { // 1 hour
                localRateLimits.delete(key)
            }
        }
    }, 600000) // 10 minutes
}
