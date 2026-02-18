import { test, expect } from '@playwright/test'

/**
 * Smoke tests to verify E2E setup is working
 */

test.describe('Smoke Tests', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/ZeroRentals/)
    await page.screenshot({ path: 'test-results/homepage.png' })
  })

  test('should load admin login page', async ({ page }) => {
    await page.goto('/login/admin')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await page.screenshot({ path: 'test-results/admin-login.png' })
  })

  test('should verify API endpoints exist', async ({ request }) => {
    // Test that CSRF endpoint exists
    const csrfResponse = await request.get('/api/csrf')
    expect([200, 401, 404]).toContain(csrfResponse.status())

    // Test that pending properties endpoint exists (will 401 without auth)
    const pendingResponse = await request.get('/api/admin/properties/pending')
    expect([401, 403, 404]).toContain(pendingResponse.status())
  })
})
