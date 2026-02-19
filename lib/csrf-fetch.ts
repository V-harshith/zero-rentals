/**
 * CSRF-protected fetch utility
 * Automatically fetches CSRF token and includes it in the request headers
 */

export interface CsrfFetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>
}

/**
 * Fetch with CSRF token automatically included
 * For POST, PUT, PATCH, DELETE requests, fetches CSRF token first
 */
export async function csrfFetch(
  url: string,
  options: CsrfFetchOptions = {}
): Promise<Response> {
  const method = options.method?.toUpperCase() || 'GET'

  // Only need CSRF token for state-changing methods
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    // Fetch CSRF token
    const csrfResponse = await fetch('/api/csrf')
    if (!csrfResponse.ok) {
      throw new Error('Failed to fetch CSRF token')
    }
    const { csrfToken } = await csrfResponse.json()

    // Merge headers with CSRF token
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
      'x-csrf-token': csrfToken,
    }

    return fetch(url, {
      ...options,
      headers,
    })
  }

  // For GET/HEAD/OPTIONS, no CSRF token needed
  return fetch(url, options as RequestInit)
}

/**
 * Simple CSRF token fetcher for inline use
 */
export async function fetchCsrfToken(): Promise<string> {
  const response = await fetch('/api/csrf')
  if (!response.ok) {
    throw new Error('Failed to fetch CSRF token')
  }
  const { csrfToken } = await response.json()
  return csrfToken
}
