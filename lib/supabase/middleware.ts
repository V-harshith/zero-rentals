import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Simple in-memory cache for session validation to reduce concurrent refreshes
// Note: This is per-instance cache (works best with sticky sessions)
const sessionCache = new Map<string, { user: any; timestamp: number }>()
const SESSION_CACHE_TTL = 5000 // 5 seconds - short cache to balance performance vs freshness

// Helper to get session key from request cookies
function getSessionKey(request: NextRequest): string | null {
  const accessToken = request.cookies.get('sb-access-token')?.value
  const refreshToken = request.cookies.get('sb-refresh-token')?.value
  if (!accessToken) return null
  // Use a hash of the access token as the cache key
  return `${accessToken.slice(0, 16)}:${accessToken.slice(-16)}`
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          // Update request cookies for Server Components
          request.cookies.set({
            name,
            value,
            ...options,
          })
          // Update response cookies for the browser
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          // Remove from request cookies
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          // Remove from response cookies
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // CRITICAL: This refreshes the session if expired
  // It will automatically update cookies via the handlers above
  let user = null

  // Check cache first to reduce concurrent session refreshes
  const cacheKey = getSessionKey(request)
  const now = Date.now()
  const cached = cacheKey ? sessionCache.get(cacheKey) : null

  if (cached && (now - cached.timestamp) < SESSION_CACHE_TTL) {
    // Use cached session - reduces load on Supabase and prevents race conditions
    user = cached.user
  } else {
    // No cache or cache expired - fetch fresh session
    try {
      const { data: { user: supabaseUser }, error } = await supabase.auth.getUser()
      if (error) {
        // If error is "Invalid Refresh Token", we treat user as null (logged out)
        // This happens when the session on server is revoked but client has old cookie
        // We don't throw, just let them be unauthenticated
        // Session errors are handled silently to prevent console spam
      }
      user = supabaseUser

      // Cache the result to prevent concurrent refreshes
      if (cacheKey) {
        sessionCache.set(cacheKey, { user, timestamp: now })
        // Clean up old cache entries periodically (simple cleanup)
        if (sessionCache.size > 1000) {
          const cutoff = now - SESSION_CACHE_TTL
          for (const [key, entry] of sessionCache.entries()) {
            if (entry.timestamp < cutoff) {
              sessionCache.delete(key)
            }
          }
        }
      }
    } catch {
      // Session errors are handled silently to prevent console spam
    }
  }

  return { response, user, supabase }
}
