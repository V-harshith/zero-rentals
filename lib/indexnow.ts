/**
 * IndexNow API utility for instant URL indexing notifications
 * Supports Bing, Yandex, and other IndexNow-compatible search engines
 * 
 * Usage:
 *   import { submitUrlToIndexNow, submitUrlsToIndexNow } from '@/lib/indexnow'
 *   
 *   // Single URL
 *   await submitUrlToIndexNow('/property/abc-123')
 *   
 *   // Multiple URLs
 *   await submitUrlsToIndexNow(['/property/abc-123', '/property/def-456'])
 */

const INDEXNOW_KEY = '9b84d5c4c45f421caa82776dbb41486c'
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://zerorentals.com'
}

/**
 * Submit a single URL to IndexNow for immediate indexing
 * @param path - Relative path (e.g., '/property/abc-123') or full URL
 */
export async function submitUrlToIndexNow(path: string): Promise<boolean> {
  try {
    const baseUrl = getBaseUrl()
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`

    const response = await fetch(
      `${INDEXNOW_ENDPOINT}?url=${encodeURIComponent(url)}&key=${INDEXNOW_KEY}`,
      { method: 'GET' }
    )

    // 200 = OK, 202 = Accepted (URL submitted successfully)
    if (response.status === 200 || response.status === 202) {
      console.log(`[IndexNow] Successfully submitted: ${url}`)
      return true
    }

    console.warn(`[IndexNow] Submission returned status ${response.status} for: ${url}`)
    return false
  } catch (error) {
    console.error('[IndexNow] Failed to submit URL:', error)
    return false
  }
}

/**
 * Submit multiple URLs to IndexNow in a single batch request
 * @param paths - Array of relative paths or full URLs
 */
export async function submitUrlsToIndexNow(paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true

  try {
    const baseUrl = getBaseUrl()
    const host = new URL(baseUrl).host

    const urlList = paths.map((path) =>
      path.startsWith('http') ? path : `${baseUrl}${path}`
    )

    const body = {
      host,
      key: INDEXNOW_KEY,
      keyLocation: `${baseUrl}/${INDEXNOW_KEY}.txt`,
      urlList,
    }

    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (response.status === 200 || response.status === 202) {
      console.log(`[IndexNow] Successfully submitted ${urlList.length} URLs`)
      return true
    }

    console.warn(`[IndexNow] Batch submission returned status ${response.status}`)
    return false
  } catch (error) {
    console.error('[IndexNow] Failed to submit URLs:', error)
    return false
  }
}
