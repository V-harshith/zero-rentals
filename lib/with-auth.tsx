"use client"

import { useEffect, ComponentType } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "./auth-context"
import { Loader2 } from "lucide-react"

type UserRole = "admin" | "owner" | "tenant"

interface WithAuthOptions {
    requiredRole: UserRole | UserRole[]
    redirectTo?: string
}

/**
 * Higher-Order Component for protecting routes with authentication
 * 
 * Usage:
 * export default withAuth(DashboardPage, { requiredRole: 'admin' })
 * export default withAuth(PropertyEditPage, { requiredRole: ['owner', 'admin'] })
 * 
 * Features:
 * - Enforces authentication
 * - Validates user role (Admins bypass by default)
 * - Shows loading state during auth check
 * - Redirects unauthorized users
 * - Prevents flash of protected content
 */
export function withAuth<P extends object>(
    Component: ComponentType<P>,
    options: WithAuthOptions
) {
    return function ProtectedRoute(props: P) {
        const { user, isLoading } = useAuth()
        const router = useRouter()
        const { requiredRole, redirectTo } = options

        useEffect(() => {
            // Wait for auth to finish loading
            if (isLoading) return

            // No user - redirect to login
            if (!user) {
                const loginPath = Array.isArray(requiredRole) ? requiredRole[0] : requiredRole
                router.replace(`/login/${loginPath}`)
                return
            }

            // Role check logic
            const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
            const hasAccess = user.role === 'admin' || (user.role && allowedRoles.includes(user.role))

            if (!hasAccess) {

                if (redirectTo) {
                    router.replace(redirectTo)
                } else {
                    // Redirect to their correct dashboard
                    router.replace(`/dashboard/${user.role}`)
                }
                return
            }
        }, [user, isLoading, router, requiredRole, redirectTo])

        // Show loading state while checking auth
        if (isLoading) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-muted/50">
                    <div className="text-center space-y-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                        <p className="text-sm text-muted-foreground">Verifying authentication...</p>
                    </div>
                </div>
            )
        }

        // Role check for rendering
        const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
        const hasAccess = user?.role === 'admin' || (user?.role && allowedRoles.includes(user.role))

        if (!user || !hasAccess) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-muted/50">
                    <div className="text-center space-y-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                        <p className="text-sm text-muted-foreground">Redirecting...</p>
                    </div>
                </div>
            )
        }

        // User is authenticated and has correct role - render component
        return <Component {...props} />
    }
}
