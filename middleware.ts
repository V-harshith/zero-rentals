import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse } from 'next/server'
import { maskUserId } from '@/lib/security-utils'

export async function middleware(request: NextRequest) {
  // CRITICAL: This refreshes the session and updates cookies
  const { response, user, supabase } = await updateSession(request)

  const path = request.nextUrl.pathname
  const isAuthRoute = path.startsWith('/login') ||
                      path.startsWith('/register') ||
                      path.startsWith('/reset-password') ||
                      path.startsWith('/forgot-password') ||
                      path.startsWith('/auth/')
  const isAdminRoute = path.startsWith('/dashboard/admin') || path.startsWith('/api/admin')
  const isOwnerRoute = path.startsWith('/dashboard/owner') || path.startsWith('/property/add') || path.startsWith('/property/edit')
  const isProtectedRoute = isAdminRoute || isOwnerRoute || path.startsWith('/dashboard/tenant') || path.startsWith('/profile')

  // Log auth state for debugging (sanitized - no PII)
  if (process.env.NODE_ENV === 'development') {
    if (user) {
      console.log(`[MIDDLEWARE] User ${maskUserId(user.id)} accessing ${path}`)
    } else {
      console.log(`[MIDDLEWARE] No session for ${path}`)
    }
  }

  // 1. Allow access to login/register pages regardless of auth state
  if (isAuthRoute) {
    return response
  }

  // 2. Access Control: Redirect to login if accessing protected routes without auth
  if (isProtectedRoute && !user) {
    let loginPath = '/login/tenant'
    if (isAdminRoute) loginPath = '/login/admin'
    if (isOwnerRoute) loginPath = '/login/owner'

    const redirectUrl = new URL(loginPath, request.url)
    redirectUrl.searchParams.set('redirectTo', path)
    return NextResponse.redirect(redirectUrl)
  }

  // 3. Role-based access control for authenticated users
  if (user && isProtectedRoute) {
    try {
      const { data: userData, error: roleError } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      // SECURITY: Fail-closed - deny access on database errors
      // This prevents unauthorized access when database is unavailable
      if (roleError) {
        console.error(`[MIDDLEWARE] Error fetching role for user ${maskUserId(user.id)}`)
        // Redirect to error page instead of allowing access
        return NextResponse.redirect(new URL('/login/tenant?error=database_error', request.url))
      }

      const role = userData?.role || 'tenant'

      // Protect specific dashboard routes
      if (isAdminRoute && role !== 'admin') {
        return NextResponse.redirect(new URL('/', request.url))
      }
      if (isOwnerRoute && role !== 'owner' && role !== 'admin') {
        return NextResponse.redirect(new URL('/', request.url))
      }
      if (path.startsWith('/dashboard/tenant') && role !== 'tenant' && role !== 'admin') {
        const redirectPath = role === 'owner' ? '/dashboard/owner' : '/dashboard/admin'
        return NextResponse.redirect(new URL(redirectPath, request.url))
      }
    } catch (error) {
      console.error(`[MIDDLEWARE] Exception in role check for user ${maskUserId(user.id)}`)
      // SECURITY: Fail-closed - deny access on exceptions
      return NextResponse.redirect(new URL('/login/tenant?error=auth_error', request.url))
    }
  }


  // Return response with refreshed session cookies
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
