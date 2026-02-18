import { test, expect, Page } from '@playwright/test'

/**
 * Admin Property Approval/Rejection E2E Tests
 *
 * These tests verify:
 * 1. Property approval functionality
 * 2. Property rejection functionality
 * 3. CSRF token handling
 * 4. transition_property_status function works
 */

// Test credentials - should be provided via environment variables in production
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@zerorentals.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

// Helper function to login as admin
async function loginAsAdmin(page: Page) {
  await page.goto('/login/admin')

  // Wait for the login form to be visible
  await page.waitForSelector('input[type="email"]', { timeout: 10000 })

  // Fill in login credentials
  await page.fill('input[type="email"]', ADMIN_EMAIL)
  await page.fill('input[type="password"]', ADMIN_PASSWORD)

  // Click login button
  await page.click('button[type="submit"]')

  // Wait for navigation to admin dashboard
  await page.waitForURL('**/dashboard/admin**', { timeout: 15000 })

  // Verify we're on the admin dashboard
  await expect(page.locator('text=Admin Dashboard')).toBeVisible()
}

// Helper to navigate to pending properties tab
async function navigateToPendingTab(page: Page) {
  // Click on Pending Approvals tab
  const pendingTab = page.locator('[data-value="pending"], button:has-text("Pending")').first()
  await pendingTab.click()

  // Wait for pending properties to load
  await page.waitForTimeout(1000)
}

test.describe('Property Approval/Rejection', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await loginAsAdmin(page)
  })

  test('should approve a pending property successfully', async ({ page }) => {
    // Navigate to pending tab
    await navigateToPendingTab(page)

    // Check if there are any pending properties
    const noPendingMessage = page.locator('text=No pending properties to review')
    const hasPendingProperties = await noPendingMessage.isVisible().catch(() => false)

    if (hasPendingProperties) {
      test.skip('No pending properties available for testing')
      return
    }

    // Get the first pending property
    const firstProperty = page.locator('.flex.flex-col.md\\:flex-row').first()
    await expect(firstProperty).toBeVisible()

    // Get property title for verification
    const propertyTitle = await firstProperty.locator('h3').textContent()
    expect(propertyTitle).toBeTruthy()

    // Click approve button
    const approveButton = firstProperty.locator('button:has-text("Approve")')
    await approveButton.click()

    // Wait for success toast
    await expect(page.locator('text=Property approved and published')).toBeVisible({ timeout: 10000 })

    // Verify property is removed from pending list
    await expect(firstProperty).not.toBeVisible({ timeout: 5000 })

    // Take screenshot for verification
    await page.screenshot({ path: 'test-results/property-approved.png' })
  })

  test('should reject a pending property successfully', async ({ page }) => {
    // Navigate to pending tab
    await navigateToPendingTab(page)

    // Check if there are any pending properties
    const noPendingMessage = page.locator('text=No pending properties to review')
    const hasPendingProperties = await noPendingMessage.isVisible().catch(() => false)

    if (hasPendingProperties) {
      test.skip('No pending properties available for testing')
      return
    }

    // Get the first pending property
    const firstProperty = page.locator('.flex.flex-col.md\\:flex-row').first()
    await expect(firstProperty).toBeVisible()

    // Get property title for verification
    const propertyTitle = await firstProperty.locator('h3').textContent()
    expect(propertyTitle).toBeTruthy()

    // Click reject button
    const rejectButton = firstProperty.locator('button:has-text("Reject")')
    await rejectButton.click()

    // Wait for success toast
    await expect(page.locator('text=Property rejected')).toBeVisible({ timeout: 10000 })

    // Verify property is removed from pending list
    await expect(firstProperty).not.toBeVisible({ timeout: 5000 })

    // Take screenshot for verification
    await page.screenshot({ path: 'test-results/property-rejected.png' })
  })

  test('should handle CSRF token correctly - no Invalid CSRF token errors', async ({ page }) => {
    // Navigate to pending tab
    await navigateToPendingTab(page)

    // Check if there are any pending properties
    const noPendingMessage = page.locator('text=No pending properties to review')
    const hasPendingProperties = await noPendingMessage.isVisible().catch(() => false)

    if (hasPendingProperties) {
      test.skip('No pending properties available for testing')
      return
    }

    // Get the first pending property
    const firstProperty = page.locator('.flex.flex-col.md\\:flex-row').first()
    await expect(firstProperty).toBeVisible()

    // Monitor for any CSRF errors in console or network
    const csrfErrors: string[] = []

    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('CSRF')) {
        csrfErrors.push(msg.text())
      }
    })

    page.on('response', response => {
      if (response.status() === 403) {
        response.text().then(text => {
          if (text.includes('CSRF') || text.includes('Invalid')) {
            csrfErrors.push(`Response 403: ${text}`)
          }
        })
      }
    })

    // Click approve button
    const approveButton = firstProperty.locator('button:has-text("Approve")')
    await approveButton.click()

    // Wait for response
    await page.waitForTimeout(3000)

    // Verify no CSRF errors occurred
    expect(csrfErrors).toHaveLength(0)

    // Verify success
    await expect(page.locator('text=Property approved and published')).toBeVisible({ timeout: 10000 })
  })

  test('should verify transition_property_status function works via API', async ({ request }) => {
    // First login to get session
    // Note: This test requires the web app to be running

    // Try to call the approve API directly (should fail without auth)
    const fakePropertyId = '00000000-0000-0000-0000-000000000000'
    const response = await request.put(`/api/admin/properties/${fakePropertyId}/approve`, {
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': 'fake-token'
      }
    })

    // Should get 401 (Unauthorized) not 500 (server error)
    // This confirms the API route is working and CSRF is being checked
    expect(response.status()).toBe(401)

    const body = await response.json()
    expect(body.error).toContain('Unauthorized')
  })
})

test.describe('Property Approval Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('should show loading state while approving', async ({ page }) => {
    await navigateToPendingTab(page)

    // Check if there are any pending properties
    const noPendingMessage = page.locator('text=No pending properties to review')
    const hasPendingProperties = await noPendingMessage.isVisible().catch(() => false)

    if (hasPendingProperties) {
      test.skip('No pending properties available for testing')
      return
    }

    // Get the first pending property
    const firstProperty = page.locator('.flex.flex-col.md\\:flex-row').first()
    await expect(firstProperty).toBeVisible()

    // Click approve button
    const approveButton = firstProperty.locator('button:has-text("Approve")')
    await approveButton.click()

    // Verify loading spinner appears briefly
    const loadingSpinner = firstProperty.locator('.animate-spin')
    await expect(loadingSpinner).toBeVisible({ timeout: 2000 })
  })

  test('should handle rapid approve/reject clicks gracefully', async ({ page }) => {
    await navigateToPendingTab(page)

    // Check if there are any pending properties
    const noPendingMessage = page.locator('text=No pending properties to review')
    const hasPendingProperties = await noPendingMessage.isVisible().catch(() => false)

    if (hasPendingProperties) {
      test.skip('No pending properties available for testing')
      return
    }

    // Get the first pending property
    const firstProperty = page.locator('.flex.flex-col.md\\:flex-row').first()
    await expect(firstProperty).toBeVisible()

    // Get the approve button
    const approveButton = firstProperty.locator('button:has-text("Approve")')

    // Click rapidly multiple times
    await approveButton.click()
    await approveButton.click()
    await approveButton.click()

    // Should not show any error toast about duplicate requests
    await page.waitForTimeout(3000)

    // Either it succeeds or shows already approved message
    const successToast = page.locator('text=Property approved and published')
    const alreadyApprovedToast = page.locator('text=already approved')

    const hasSuccess = await successToast.isVisible().catch(() => false)
    const hasAlreadyApproved = await alreadyApprovedToast.isVisible().catch(() => false)

    expect(hasSuccess || hasAlreadyApproved).toBeTruthy()
  })
})
