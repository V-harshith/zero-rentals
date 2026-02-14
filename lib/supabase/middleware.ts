import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
  try {
    const { data: { user: supabaseUser }, error } = await supabase.auth.getUser()
    if (error) {
      // If error is "Invalid Refresh Token", we treat user as null (logged out)
      // This happens when the session on server is revoked but client has old cookie
      // We don't throw, just let them be unauthenticated
      if (error.message?.includes('Refresh Token Not Found') || error.message?.includes('Invalid Refresh Token')) {
        console.warn(`[MIDDLEWARE] Invalid refresh token, treating as logged out: ${error.message}`)
      } else {
         console.error(`[MIDDLEWARE] Error fetching user:`, error)
      }
    }
    user = supabaseUser
  } catch (err: any) {
    if (err?.message?.includes('Refresh Token Not Found') || err?.message?.includes('Invalid Refresh Token')) {
        console.warn(`[MIDDLEWARE] Exception: Invalid refresh token, treating as logged out: ${err.message}`)
    } else {
        console.error(`[MIDDLEWARE] Unexpected exception fetching user:`, err)
    }
  }

  return { response, user, supabase }
}
