'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

interface CsrfContextType {
  csrfToken: string | null
  isLoading: boolean
}

const CsrfContext = createContext<CsrfContextType>({
  csrfToken: null,
  isLoading: true
})

export function useCsrf() {
  return useContext(CsrfContext)
}

export function CsrfProvider({ children }: { children: React.ReactNode }) {
  const [csrfToken, setCsrfToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Fetch CSRF token on mount
    fetch('/api/csrf')
      .then(res => res.json())
      .then(data => {
        if (data.csrfToken) {
          setCsrfToken(data.csrfToken)
        }
      })
      .catch(() => {
        // Silently fail - CSRF token not critical for read operations
      })
      .finally(() => setIsLoading(false))
  }, [])

  return (
    <CsrfContext.Provider value={{ csrfToken, isLoading }}>
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
