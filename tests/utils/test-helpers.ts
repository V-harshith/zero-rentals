/**
 * Test utilities for bulk import E2E tests
 */

import { Page, expect } from '@playwright/test'

/**
 * Login as admin user
 * Note: This assumes you have test credentials or a test auth setup
 */
export async function loginAsAdmin(page: Page, email?: string, password?: string) {
  // Navigate to login page
  await page.goto('/login')

  // Fill in credentials
  // Note: Update selectors based on your actual login form
  await page.fill('input[type="email"]', email || process.env.TEST_ADMIN_EMAIL || 'admin@example.com')
  await page.fill('input[type="password"]', password || process.env.TEST_ADMIN_PASSWORD || 'password')

  // Submit login
  await page.click('button[type="submit"]')

  // Wait for navigation to dashboard
  await page.waitForURL('/dashboard**', { timeout: 10000 })
}

/**
 * Clear all bulk import test data
 * This should be called in afterEach to clean up
 */
export async function cleanupBulkImportData(jobId?: string) {
  // This would need to be implemented based on your cleanup strategy
  // Could be a direct database call or an API endpoint
  console.log('Cleaning up bulk import data:', jobId)
}

/**
 * Wait for network idle with timeout
 */
export async function waitForNetworkIdle(page: Page, timeout: number = 10000) {
  await page.waitForLoadState('networkidle', { timeout })
}

/**
 * Check if element exists without throwing
 */
export async function elementExists(page: Page, selector: string): Promise<boolean> {
  try {
    await page.locator(selector).waitFor({ timeout: 2000 })
    return true
  } catch {
    return false
  }
}

/**
 * Get text content safely
 */
export async function getTextContent(page: Page, selector: string): Promise<string | null> {
  try {
    return await page.locator(selector).textContent({ timeout: 5000 })
  } catch {
    return null
  }
}

/**
 * Retry an operation with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error
      const delay = baseDelay * Math.pow(2, i)
      console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

/**
 * Generate a unique test identifier
 */
export function generateTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Create a minimal valid JPEG buffer
 */
export function createMinimalJpegBuffer(width: number = 100, height: number = 100): Buffer {
  // This is a minimal valid JPEG structure
  // In production, you might want to use a proper image generation library
  const jpegHeader = Buffer.from([
    0xFF, 0xD8, // SOI marker
    0xFF, 0xE0, // APP0 marker
    0x00, 0x10, // Length
    0x4A, 0x46, 0x49, 0x46, 0x00, // JFIF identifier
    0x01, 0x01, // Version
    0x00, // Units
    0x00, 0x01, // X density
    0x00, 0x01, // Y density
    0x00, 0x00, // Thumbnail
  ])

  // Add minimal frame data
  const frameData = Buffer.alloc(width * height * 3, 0x80)

  const jpegFooter = Buffer.from([
    0xFF, 0xD9, // EOI marker
  ])

  return Buffer.concat([jpegHeader, frameData, jpegFooter])
}

/**
 * Parse Excel-like data to buffer
 * Simple utility for creating test Excel files
 */
export function createSimpleExcelBuffer(data: Record<string, unknown>[]): Buffer {
  // This is a placeholder - in real tests you'd use xlsx library
  // or create actual files on disk
  const XLSX = require('xlsx')
  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Properties')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

/**
 * Mock console methods to capture logs
 */
export function captureConsoleLogs(page: Page): { logs: string[]; errors: string[] } {
  const logs: string[] = []
  const errors: string[] = []

  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`)
    if (msg.type() === 'error') {
      errors.push(msg.text())
    }
  })

  page.on('pageerror', error => {
    errors.push(error.message)
  })

  return { logs, errors }
}

/**
 * Verify no critical errors in console
 */
export function verifyNoCriticalErrors(errors: string[]): void {
  const criticalPatterns = [
    'bulk_import_job_id',
    'column does not exist',
    'relation does not exist',
    'syntax error',
    'permission denied',
  ]

  const criticalErrors = errors.filter(error =>
    criticalPatterns.some(pattern => error.toLowerCase().includes(pattern.toLowerCase()))
  )

  if (criticalErrors.length > 0) {
    throw new Error(`Critical errors found: ${criticalErrors.join(', ')}`)
  }
}

/**
 * Wait for element to have specific text
 */
export async function waitForText(
  page: Page,
  selector: string,
  text: string | RegExp,
  timeout: number = 10000
): Promise<void> {
  await expect(page.locator(selector)).toHaveText(text, { timeout })
}

/**
 * Take screenshot on failure
 */
export async function takeScreenshot(page: Page, name: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = `test-results/screenshots/${name}-${timestamp}.png`
  await page.screenshot({ path, fullPage: true })
  return path
}
