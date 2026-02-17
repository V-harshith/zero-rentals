import { toast } from "sonner"
import { ERROR_MESSAGES } from "@/lib/constants"

// Track if we're already redirecting to prevent multiple redirects
let isRedirecting = false

export type AppError = {
    message: string
    code?: string
    details?: Record<string, unknown>
}

/**
 * Standardized error handling for client-side operations.
 * Logs to console and shows a user-friendly toast message.
 */
export function handleError(error: unknown, customMessage?: string) {
    // Errors should be sent to a proper error tracking service (Sentry, etc.)
    // rather than console output in production

    let message = customMessage || ERROR_MESSAGES.GENERIC.SERVER_ERROR

    // Handle string errors
    if (typeof error === 'string') {
        message = error
    }
    // Handle specific Supabase/Zod/App errors
    else if (error instanceof Error || (error && typeof error === 'object' && 'message' in error)) {
        const errMessage = (error as { message?: string }).message || ''
        // Map common technical errors to user-friendly messages
        if (errMessage.includes("PGRST116")) {
            message = ERROR_MESSAGES.PROPERTY.NOT_FOUND
        } else if (errMessage.includes("JWT")) {
            message = "Your session has expired. Please log in again."
        } else if (errMessage.includes("Validation Failed")) {
            message = "Please check the information you entered."
        } else if (errMessage.includes("Rate limit")) {
            message = ERROR_MESSAGES.GENERIC.RATE_LIMIT
        } else {
            message = customMessage || errMessage || ERROR_MESSAGES.GENERIC.SERVER_ERROR
        }
    }
    // Handle empty objects or objects without message
    else if (error && typeof error === 'object') {
        message = customMessage || ERROR_MESSAGES.GENERIC.SERVER_ERROR
    }

    toast.error(message, {
        description: error && typeof error === 'object' && 'details' in error
            ? JSON.stringify((error as { details?: unknown }).details)
            : undefined,
    })

    return { message, error }
}

/**
 * Wraps an async function with standardized error handling.
 */
export async function withErrorHandling<T>(
    fn: () => Promise<T>,
    customMessage?: string
): Promise<T | null> {
    try {
        return await fn()
    } catch (error) {
        handleError(error, customMessage)
        return null
    }
}

/**
 * Checks if an error is an authentication/session error
 */
export function isAuthError(error: unknown): boolean {
    if (!error) return false

    const errMessage = typeof error === 'string'
        ? error
        : (error instanceof Error || (error && typeof error === 'object' && 'message' in error))
            ? String((error as { message?: string }).message)
            : ''

    const errCode = (error && typeof error === 'object' && 'code' in error)
        ? String((error as { code?: string }).code)
        : ''

    return (
        errMessage.includes('JWT') ||
        errMessage.includes('session') ||
        errMessage.includes('unauthorized') ||
        errMessage.includes('Unauthorized') ||
        errCode === '401' ||
        errCode === '403' ||
        errCode === 'P0001'
    )
}

/**
 * Handles authentication errors by showing a toast and redirecting to login.
 * Returns true if an auth error was handled, false otherwise.
 */
export function handleAuthError(error: unknown, redirectPath: string = '/login'): boolean {
    if (!isAuthError(error)) {
        return false
    }

    if (isRedirecting) {
        return true
    }

    isRedirecting = true
    toast.error('Your session has expired. Please log in again.')

    // Preserve current URL for post-login redirect
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : ''
    const returnUrl = currentPath && currentPath !== redirectPath ? `?redirectTo=${encodeURIComponent(currentPath)}` : ''

    // Delay redirect slightly to allow toast to show
    setTimeout(() => {
        if (typeof window !== 'undefined') {
            window.location.href = `${redirectPath}${returnUrl}`
        }
    }, 1500)

    return true
}

/**
 * Enhanced error handler that checks for auth errors first, then falls back to generic handling.
 * Use this for all API calls in dashboard pages.
 */
export function handleDashboardError(error: unknown, customMessage?: string): boolean {
    // First check if it's an auth error
    if (handleAuthError(error)) {
        return true
    }

    // Otherwise, use generic error handling
    handleError(error, customMessage)
    return false
}
