'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

interface CsrfContextType {
  csrfToken: string | null
  isLoading: boolean
  refreshToken: () => Promise<void>
}

const CsrfContext = createContext<CsrfContextType>({
  csrfToken: null,
  isLoading: true,
  refreshToken: async () => {}
})

const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 500 // ms

export function useCsrf() {
  return useContext(CsrfContext)
}

export function CsrfProvider({ children }: { children: React.ReactNode }) {
  const [csrfToken, setCsrfToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchCsrfToken = useCallback(async (retryCount = 0): Promise<string | null> => {
    try {
      const response = await fetch('/api/csrf')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      if (data.csrfToken) {
        return data.csrfToken
      }
      throw new Error('No CSRF token in response')
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount)
        console.warn(`[CSRF] Failed to fetch token, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        return fetchCsrfToken(retryCount + 1)
      }
      console.error('[CSRF] Failed to fetch token after all retries:', error)
      return null
    }
  }, [])

  const refreshToken = useCallback(async () => {
    setIsLoading(true)
    const token = await fetchCsrfToken()
    setCsrfToken(token)
    setIsLoading(false)
  }, [fetchCsrfToken])

  useEffect(() => {
    let isMounted = true

    const initToken = async () => {
      const token = await fetchCsrfToken()
      if (isMounted) {
        setCsrfToken(token)
        setIsLoading(false)
      }
    }

    initToken()

    return () => {
      isMounted = false
    }
  }, [fetchCsrfToken])

  return (
    <CsrfContext.Provider value={{ csrfToken, isLoading, refreshToken }}>
      {children}
    </CsrfContext.Provider>
  )
}

/**
 * Hook to make authenticated requests with CSRF token
 */
export function useSecureFetch() {
  const { csrfToken } = useCsrf()

  return async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers)

    // Add CSRF token for state-changing methods
    if (csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method || '')) {
      headers.set('x-csrf-token', csrfToken)
    }

    return fetch(url, {
      ...options,
      headers
    })
  }
}
