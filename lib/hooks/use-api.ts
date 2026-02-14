"use client"

import { useState, useCallback, useRef } from "react"
import { toast } from "sonner"
import { DASHBOARD_CONSTANTS, ERROR_MESSAGES } from "@/lib/constants"

interface ApiState<T> {
    data: T | null
    loading: boolean
    error: Error | null
}

interface UseApiOptions {
    showSuccessToast?: boolean
    showErrorToast?: boolean
    successMessage?: string
    retryCount?: number
    retryDelay?: number
}

export interface UseApiReturn<T, Args extends unknown[]> {
    data: T | null
    loading: boolean
    error: Error | null
    execute: (...args: Args) => Promise<T | null>
    reset: () => void
    retry: () => void
}

/**
 * Generic API hook with retry logic, error handling, and loading states
 *
 * @param apiFunction - The async function to call
 * @param options - Configuration options
 * @returns Api state and control functions
 *
 * @example
 * const { data, loading, error, execute } = useApi(fetchProperties, {
 *   showErrorToast: true,
 *   retryCount: 3
 * })
 *
 * useEffect(() => {
 *   execute()
 * }, [execute])
 */
export function useApi<T, Args extends unknown[]>(
    apiFunction: (...args: Args) => Promise<T>,
    options: UseApiOptions = {}
): UseApiReturn<T, Args> {
    const {
        showSuccessToast = false,
        showErrorToast = true,
        successMessage = "Operation completed successfully",
        retryCount = DASHBOARD_CONSTANTS.MAX_RETRIES,
        retryDelay = DASHBOARD_CONSTANTS.RETRY_DELAY_MS,
    } = options

    const [state, setState] = useState<ApiState<T>>({
        data: null,
        loading: false,
        error: null,
    })

    // Store last args for retry functionality
    const lastArgsRef = useRef<Args | null>(null)
    const retryAttemptRef = useRef(0)

    const reset = useCallback(() => {
        setState({ data: null, loading: false, error: null })
        lastArgsRef.current = null
        retryAttemptRef.current = 0
    }, [])

    const execute = useCallback(
        async (...args: Args): Promise<T | null> => {
            // Store args for potential retry
            lastArgsRef.current = args
            retryAttemptRef.current = 0

            setState((prev) => ({ ...prev, loading: true, error: null }))

            const attemptRequest = async (): Promise<T | null> => {
                try {
                    const result = await apiFunction(...args)

                    setState({
                        data: result,
                        loading: false,
                        error: null,
                    })

                    if (showSuccessToast) {
                        toast.success(successMessage)
                    }

                    retryAttemptRef.current = 0
                    return result
                } catch (err) {
                    const error =
                        err instanceof Error
                            ? err
                            : new Error(ERROR_MESSAGES.GENERIC.SERVER_ERROR)

                    retryAttemptRef.current++

                    // Retry logic
                    if (retryAttemptRef.current < retryCount) {
                        await new Promise((resolve) =>
                            setTimeout(resolve, retryDelay * retryAttemptRef.current)
                        )
                        return attemptRequest()
                    }

                    // Max retries reached
                    setState({
                        data: null,
                        loading: false,
                        error,
                    })

                    if (showErrorToast) {
                        toast.error(error.message || ERROR_MESSAGES.GENERIC.SERVER_ERROR)
                    }

                    return null
                }
            }

            return attemptRequest()
        },
        [apiFunction, showSuccessToast, showErrorToast, successMessage, retryCount, retryDelay]
    )

    const retry = useCallback(() => {
        if (lastArgsRef.current) {
            retryAttemptRef.current = 0
            return execute(...lastArgsRef.current)
        }
    }, [execute])

    return {
        ...state,
        execute,
        reset,
        retry,
    }
}

/**
 * Hook for paginated API calls
 */
export interface PaginatedData<T> {
    data: T[]
    total: number
    page: number
    totalPages: number
}

interface UsePaginatedApiOptions extends Omit<UseApiOptions, "showSuccessToast"> {
    pageSize?: number
}

export interface UsePaginatedApiReturn<T, Args extends unknown[]> extends Omit<UseApiReturn<PaginatedData<T>, Args>, "data"> {
    data: T[]
    pagination: {
        page: number
        setPage: (page: number) => void
        totalPages: number
        total: number
        hasNextPage: boolean
        hasPrevPage: boolean
    }
}

export function usePaginatedApi<T, Args extends unknown[]>(
    apiFunction: (page: number, pageSize: number, ...args: Args) => Promise<PaginatedData<T>>,
    options: UsePaginatedApiOptions = {}
): UsePaginatedApiReturn<T, Args> {
    const { pageSize = DASHBOARD_CONSTANTS.DEFAULT_PAGE_SIZE, ...apiOptions } = options

    const [page, setPage] = useState(1)
    const [paginationData, setPaginationData] = useState<Omit<PaginatedData<T>, "data">>({
        total: 0,
        page: 1,
        totalPages: 0,
    })

    const wrappedFunction = useCallback(
        async (...args: Args): Promise<PaginatedData<T>> => {
            const result = await apiFunction(page, pageSize, ...args)
            setPaginationData({
                total: result.total,
                page: result.page,
                totalPages: result.totalPages,
            })
            return result
        },
        [apiFunction, page, pageSize]
    )

    const { data, loading, error, execute, reset, retry } = useApi(wrappedFunction, apiOptions)

    return {
        data: data?.data ?? [],
        loading,
        error,
        execute,
        reset,
        retry,
        pagination: {
            page,
            setPage,
            totalPages: paginationData.totalPages,
            total: paginationData.total,
            hasNextPage: page < paginationData.totalPages,
            hasPrevPage: page > 1,
        },
    }
}
