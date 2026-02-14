import { toast } from "sonner"
import { ERROR_MESSAGES } from "@/lib/constants"

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
    // Better error logging - serialize non-enumerable properties
    if (error && typeof error === 'object') {
        const err = error as Record<string, unknown>
        console.error("AppError:", {
            message: err.message,
            code: err.code,
            details: err.details,
            hint: err.hint,
            stack: err.stack,
            raw: error
        })
    } else {
        console.error("AppError:", error)
    }

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
