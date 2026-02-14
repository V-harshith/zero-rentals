/**
 * Simple in-memory rate limiter for demo/local use.
 * NOTE: For production on Vercel/Edge, replace this with @upstash/ratelimit (Redis).
 */

import { NextRequest } from 'next/server'

const rateLimits = new Map<string, { count: number; lastReset: number }>()

export async function rateLimit(identifier: string, limit: number = 5, windowMs: number = 60000) {
    const now = Date.now()
    const record = rateLimits.get(identifier)

    if (!record || now - record.lastReset > windowMs) {
        rateLimits.set(identifier, { count: 1, lastReset: now })
        return { success: true, remaining: limit - 1 }
    }

    if (record.count >= limit) {
        return { success: false, remaining: 0 }
    }

    record.count += 1
    return { success: true, remaining: limit - record.count }
}

interface RateLimitResult {
    limited: boolean
    headers?: Record<string, string>
}

/**
 * Check rate limit for a request using IP + action as identifier
 */
export async function checkRateLimit(
    request: NextRequest,
    action: string,
    limit: number = 30,
    windowMs: number = 60000
): Promise<RateLimitResult> {
    // Get IP from headers (request.ip is not available in NextRequest)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
               request.headers.get('x-real-ip') ??
               'unknown'
    const identifier = `${ip}:${action}`

    const result = await rateLimit(identifier, limit, windowMs)

    if (!result.success) {
        return {
            limited: true,
            headers: {
                'X-RateLimit-Limit': limit.toString(),
                'X-RateLimit-Remaining': '0',
                'Retry-After': Math.ceil(windowMs / 1000).toString()
            }
        }
    }

    return {
        limited: false,
        headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': result.remaining.toString()
        }
    }
}

// Cleanup interval to prevent memory leaks
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now()
        for (const [key, record] of rateLimits.entries()) {
            if (now - record.lastReset > 3600000) { // 1 hour
                rateLimits.delete(key)
            }
        }
    }, 600000) // 10 minutes
}
