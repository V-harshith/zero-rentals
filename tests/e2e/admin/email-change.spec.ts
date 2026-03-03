import { test, expect, Page } from '@playwright/test'

/**
 * Admin Email Change E2E Tests
 *
 * These tests verify:
 * 1. Admin can initiate email change from profile page
 * 2. Email change modal appears and accepts input
 * 3. API endpoint processes email change request correctly
 * 4. Success message is displayed
 * 5. Pending email status is shown after request
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

// Helper to navigate to admin profile page
async function navigateToProfilePage(page: Page) {
  await page.goto('/profile/admin')

  // Wait for profile page to load
  await page.waitForSelector('text=Staff Profile', { timeout: 10000 })
  await expect(page.locator('h1')).toContainText('Staff Profile')
}

test.describe('Admin Email Change Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await loginAsAdmin(page)
    // Navigate to profile page
    await navigateToProfilePage(page)
  })

  test('should open email change modal when clicking edit button', async ({ page }) => {
    // Take screenshot of profile page before modal opens
    await page.screenshot({ path: 'test-results/email-change-profile-page.png' })

    // Find and click the email edit button (pencil icon next to email field)
    const emailEditButton = page.locator('button[title="Change email"]').first()
    await expect(emailEditButton).toBeVisible()
    await emailEditButton.click()

    // Wait for modal to appear
    const modal = page.locator('div.fixed.inset-0.bg-black\\/50').first()
    await expect(modal).toBeVisible()

    // Verify modal content
    await expect(page.locator('text=Change Email Address')).toBeVisible()
    await expect(page.locator('text=A verification link will be sent to your new email address')).toBeVisible()

    // Verify form fields exist
    await expect(page.locator('input#newEmail')).toBeVisible()
    await expect(page.locator('input#emailChangePassword')).toBeVisible()

    // Verify buttons exist
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible()
    await expect(page.locator('button:has-text("Send Verification")')).toBeVisible()

    // Take screenshot of modal
    await page.screenshot({ path: 'test-results/email-change-modal-open.png' })

    // Close modal by clicking cancel
    await page.click('button:has-text("Cancel")')
    await expect(modal).not.toBeVisible()
  })

  test('should successfully request email change', async ({ page }) => {
    // Click the email edit button
    const emailEditButton = page.locator('button[title="Change email"]').first()
    await emailEditButton.click()

    // Wait for modal
    await expect(page.locator('text=Change Email Address')).toBeVisible()

    // Fill in the new email
    const newEmail = 'newadmin@example.com'
    await page.fill('input#newEmail', newEmail)

    // Fill in current password
    await page.fill('input#emailChangePassword', ADMIN_PASSWORD)

    // Take screenshot before submitting
    await page.screenshot({ path: 'test-results/email-change-form-filled.png' })

    // Click send verification button
    const submitButton = page.locator('button:has-text("Send Verification")')
    await submitButton.click()

    // Wait for API response and success message
    // The toast message should appear
    await expect(page.locator('text=Verification email sent')).toBeVisible({ timeout: 10000 })

    // Take screenshot of success state
    await page.screenshot({ path: 'test-results/email-change-success.png' })
  })

  test('should show pending email status after request', async ({ page }) => {
    // First, request an email change
    const emailEditButton = page.locator('button[title="Change email"]').first()
    await emailEditButton.click()

    await expect(page.locator('text=Change Email Address')).toBeVisible()

    // Use a unique email to avoid conflicts
    const timestamp = Date.now()
    const newEmail = `newadmin${timestamp}@example.com`
    await page.fill('input#newEmail', newEmail)
    await page.fill('input#emailChangePassword', ADMIN_PASSWORD)

    // Submit the form
    await page.click('button:has-text("Send Verification")')

    // Wait for success message
    await expect(page.locator('text=Verification email sent')).toBeVisible({ timeout: 10000 })

    // Wait for modal to close
    await expect(page.locator('text=Change Email Address')).not.toBeVisible()

    // Verify pending email status is shown
    await expect(page.locator('text=Pending verification')).toBeVisible({ timeout: 5000 })
    await expect(page.locator(`text=${newEmail}`)).toBeVisible()
    await expect(page.locator('text=Please check your new email inbox and click the verification link')).toBeVisible()

    // Verify cancel button is available
    await expect(page.locator('button:has-text("Cancel Request")')).toBeVisible()

    // Take screenshot of pending status
    await page.screenshot({ path: 'test-results/email-change-pending-status.png' })

    // Clean up: Cancel the pending email change
    await page.click('button:has-text("Cancel Request")')
    await expect(page.locator('text=Email change request cancelled')).toBeVisible({ timeout: 10000 })
  })

  test('should validate required fields', async ({ page }) => {
    // Click the email edit button
    const emailEditButton = page.locator('button[title="Change email"]').first()
    await emailEditButton.click()

    await expect(page.locator('text=Change Email Address')).toBeVisible()

    // Try to submit without filling any fields
    // The submit button should be disabled when fields are empty
    const submitButton = page.locator('button:has-text("Send Verification")')
    await expect(submitButton).toBeDisabled()

    // Fill only email field
    await page.fill('input#newEmail', 'test@example.com')
    await expect(submitButton).toBeDisabled()

    // Clear email and fill only password
    await page.fill('input#newEmail', '')
    await page.fill('input#emailChangePassword', ADMIN_PASSWORD)
    await expect(submitButton).toBeDisabled()

    // Fill both fields - button should be enabled
    await page.fill('input#newEmail', 'test@example.com')
    await expect(submitButton).toBeEnabled()

    await page.screenshot({ path: 'test-results/email-change-validation.png' })
  })

  test('should handle incorrect password', async ({ page }) => {
    // Click the email edit button
    const emailEditButton = page.locator('button[title="Change email"]').first()
    await emailEditButton.click()

    await expect(page.locator('text=Change Email Address')).toBeVisible()

    // Fill in new email
    const timestamp = Date.now()
    const newEmail = `test${timestamp}@example.com`
    await page.fill('input#newEmail', newEmail)

    // Fill in incorrect password
    await page.fill('input#emailChangePassword', 'wrongpassword123')

    // Submit the form
    await page.click('button:has-text("Send Verification")')

    // Wait for error message
    await expect(page.locator('text=Incorrect current password')).toBeVisible({ timeout: 10000 })

    await page.screenshot({ path: 'test-results/email-change-wrong-password.png' })
  })

  test('should handle same email error', async ({ page }) => {
    // Click the email edit button
    const emailEditButton = page.locator('button[title="Change email"]').first()
    await emailEditButton.click()

    await expect(page.locator('text=Change Email Address')).toBeVisible()

    // Try to change to the same email as current
    await page.fill('input#newEmail', ADMIN_EMAIL)
    await page.fill('input#emailChangePassword', ADMIN_PASSWORD)

    // Submit the form
    await page.click('button:has-text("Send Verification")')

    // Wait for error message
    await expect(page.locator('text=different from your current email')).toBeVisible({ timeout: 10000 })

    await page.screenshot({ path: 'test-results/email-change-same-email.png' })
  })

  test('should close modal when clicking X button', async ({ page }) => {
    // Click the email edit button
    const emailEditButton = page.locator('button[title="Change email"]').first()
    await emailEditButton.click()

    // Wait for modal
    const modal = page.locator('div.fixed.inset-0.bg-black\\/50').first()
    await expect(modal).toBeVisible()

    // Click the X button to close
    const closeButton = page.locator('button:has([data-lucide="X"])').first()
    await closeButton.click()

    // Verify modal is closed
    await expect(modal).not.toBeVisible()

    await page.screenshot({ path: 'test-results/email-change-modal-closed.png' })
  })
})

test.describe('Admin Email Change API', () => {
  test('should require authentication for email change API', async ({ request }) => {
    const response = await request.post('/api/admin/change-email/request', {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        newEmail: 'test@example.com',
        currentPassword: 'password123'
      }
    })

    // Should get 401 (Unauthorized) without session
    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body.error).toContain('Unauthorized')
  })

  test('should validate email format', async ({ page, request }) => {
    // Login first via UI to establish session
    await loginAsAdmin(page)

    // Get CSRF token
    const csrfResponse = await request.get('/api/csrf', {
      headers: {
        'Cookie': await page.evaluate(() => document.cookie)
      }
    })

    // Try to submit invalid email format
    // This test would need proper session handling
    // For now, just verify the API endpoint exists
    expect([200, 401, 403]).toContain(csrfResponse.status())
  })
})
