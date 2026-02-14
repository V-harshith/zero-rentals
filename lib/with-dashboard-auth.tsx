"use client"

import { useEffect, ComponentType, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "./auth-context"
import { Loader2 } from "lucide-react"

type UserRole = "admin" | "owner" | "tenant"

interface WithDashboardAuthOptions {
    requiredRole: UserRole | UserRole[]
    redirectTo?: string
    /**
     * Optional callback to prefetch data when user is ready
     * This ensures data fetching only happens after auth is confirmed
     */
    onUserReady?: (user: any) => Promise<any>
}

/**
 * Enhanced Higher-Order Component for protecting dashboard routes
 * 
 * Improvements over withAuth:
 * - Guarantees user object is available before rendering
 * - Prevents race conditions in data fetching
 * - Better error handling and loading states
 * - Optional data prefetching callback
 * 
 * Usage:
 * export default withDashboardAuth(OwnerDashboard, { 
 *   requiredRole: 'owner',
 *   onUserReady: async (user) => {
 *     // Prefetch critical data here
 *     const properties = await fetchProperties(user.id)
 *     return { properties }
 *   }
 * })
 */
export function withDashboardAuth<P extends object>(
    Component: ComponentType<P>,
    options: WithDashboardAuthOptions
) {
    return function ProtectedDashboard(props: P) {
        const { user, isLoading: authLoading } = useAuth()
        const router = useRouter()
        const { requiredRole, redirectTo, onUserReady } = options

        const [prefetchedData, setPrefetchedData] = useState<any>(null)
        const [isPrefetching, setIsPrefetching] = useState(false)
        const [prefetchError, setPrefetchError] = useState<string | null>(null)

        // Use ref to track if we've initiated prefetch to prevent infinite loops
        const hasPrefetchedRef = useRef(false)

        // Auth validation and prefetching
        useEffect(() => {
            // Wait for auth to finish loading
            if (authLoading) return

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

            // Prefetch data if callback provided and not already prefetched
            if (onUserReady && !hasPrefetchedRef.current && !isPrefetching && !prefetchError) {
                hasPrefetchedRef.current = true
                setIsPrefetching(true)
                setPrefetchError(null)

                onUserReady(user)
                    .then((data) => {
                        setPrefetchedData(data)
                        setIsPrefetching(false)
                    })
                    .catch((error: Error) => {
                        setPrefetchError(error.message || 'Failed to load dashboard data')
                        setIsPrefetching(false)
                    })
            }
        }, [user, authLoading, router, requiredRole, redirectTo, isPrefetching, prefetchError])
        // NOTE: Removed onUserReady from dependencies to prevent infinite loop

        // Show loading state while checking auth or prefetching
        if (authLoading || (onUserReady && isPrefetching)) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-muted/50">
                    <div className="text-center space-y-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                        <p className="text-sm text-muted-foreground">
                            {authLoading ? 'Verifying authentication...' : 'Loading dashboard...'}
                        </p>
                    </div>
                </div>
            )
        }

        // Show error state if prefetch failed
        if (prefetchError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-muted/50">
                    <div className="text-center space-y-4 max-w-md">
                        <div className="text-destructive">
                            <svg className="h-12 w-12 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h2 className="text-lg font-semibold">Failed to Load Dashboard</h2>
                        <p className="text-sm text-muted-foreground">{prefetchError}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                        >
                            Retry
                        </button>
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
        // Pass prefetched data as props if available
        const componentProps = prefetchedData
            ? { ...props, prefetchedData }
            : props

        return <Component {...componentProps} />
    }
}
