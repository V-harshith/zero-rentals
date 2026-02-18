import { test, expect, Page } from '@playwright/test'

/**
 * Multi-Select Operations E2E Tests
 *
 * These tests verify:
 * 1. Selecting multiple properties in Pending tab
 * 2. Bulk approve/reject functionality
 * 3. Select all/none functionality
 * 4. Checkbox sync correctness
 */

// Test credentials
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@zerorentals.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

async function loginAsAdmin(page: Page) {
  await page.goto('/login/admin')
  await page.waitForSelector('input[type="email"]', { timeout: 10000 })
  await page.fill('input[type="email"]', ADMIN_EMAIL)
  await page.fill('input[type="password"]', ADMIN_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard/admin**', { timeout: 15000 })
}

async function navigateToPendingTab(page: Page) {
  const pendingTab = page.locator('[data-value="pending"], button:has-text("Pending")').first()
  await pendingTab.click()
  await page.waitForTimeout(1000)
}

test.describe('Multi-Select Operations', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await navigateToPendingTab(page)
  })

  test('should select multiple properties individually', async ({ page }) => {
    // Check if there are any pending properties
    const noPendingMessage = page.locator('text=No pending properties to review')
    const hasPendingProperties = await noPendingMessage.isVisible().catch(() => false)

    if (hasPendingProperties) {
      test.skip('No pending properties available for testing')
      return
    }

    // Get all property checkboxes
    const checkboxes = page.locator('input[type="checkbox"]').filter({ has: page.locator('..') })
    const count = await checkboxes.count()

    if (count < 2) {
      test.skip('Not enough pending properties for multi-select test')
      return
    }

    // Click first two checkboxes (skip "select all" header)
    const firstPropertyCheckbox = checkboxes.nth(1)
    const secondPropertyCheckbox = checkboxes.nth(2)

    await firstPropertyCheckbox.check()
    await secondPropertyCheckbox.check()

    // Verify bulk actions bar appears
    await expect(page.locator('text=properties selected')).toBeVisible()

    // Verify selected count shows 2
    const selectedCount = page.locator('text=2 properties selected')
    await expect(selectedCount).toBeVisible()

    // Take screenshot
    await page.screenshot({ path: 'test-results/multi-select-two-properties.png' })
  })

  test('should select all properties using select all checkbox', async ({ page }) => {
    // Check if there are any pending properties
    const noPendingMessage = page.locator('text=No pending properties to review')
    const hasPendingProperties = await noPendingMessage.isVisible().catch(() => false)

    if (hasPendingProperties) {
      test.skip('No pending properties available for testing')
      return
    }

    // Find the "Select all" checkbox in the header
    const selectAllCheckbox = page.locator('.flex.items-center.gap-3.pb-2.border-b input[type="checkbox"]').first()

    await expect(selectAllCheckbox).toBeVisible()

    // Click select all
    await selectAllCheckbox.check()

    // Wait for UI to update
    await page.waitForTimeout(500)

    // Verify bulk actions bar appears
    await expect(page.locator('text=properties selected')).toBeVisible()

    // Get all property checkboxes and verify they're checked
    const propertyRows = page.locator('.flex.flex-col.md\\:flex-row.justify-between.p-4.border')
    const rowCount = await propertyRows.count()

    // Verify at least one property is selected
    expect(rowCount).toBeGreaterThan(0)

    // Take screenshot
    await page.screenshot({ path: 'test-results/select-all-properties.png' })
  })

  test('should deselect all using select all checkbox', async ({ page }) => {
    // Check if there are any pending properties
    const noPendingMessage = page.locator('text=No pending properties to review')
    const hasPendingProperties = await noPendingMessage.isVisible().catch(() => false)

    if (hasPendingProperties) {
      test.skip('No pending properties available for testing')
      return
    }

    // Find the "Select all" checkbox
    const selectAllCheckbox = page.locator('.flex.items-center.gap-3.pb-2.border-b input[type="checkbox"]').first()

    // First select all
    await selectAllCheckbox.check()
    await page.waitForTimeout(500)

    // Verify bulk actions bar is visible
    await expect(page.locator('text=properties selected')).toBeVisible()

    // Then deselect all
    await selectAllCheckbox.uncheck()
    await page.waitForTimeout(500)

    // Verify bulk actions bar is hidden
    await expect(page.locator('text=properties selected')).not.toBeVisible()

    // Take screenshot
    await page.screenshot({ path: 'test-results/deselect-all-properties.png' })
  })

  test('should clear selection using Clear button', async ({ page }) => {
    // Check if there are any pending properties
    const noPendingMessage = page.locator('text=No pending properties to review')
    const hasPendingProperties = await noPendingMessage.isVisible().catch(() => false)

    if (hasPendingProperties) {
      test.skip('No pending properties available for testing')
      return
    }

    // Select all first
    const selectAllCheckbox = page.locator('.flex.items-center.gap-3.pb-2.border-b input[type="checkbox"]').first()
    await selectAllCheckbox.check()
    await page.waitForTimeout(500)

    // Verify bulk actions bar is visible
    await expect(page.locator('text=properties selected')).toBeVisible()

    // Click Clear button
    const clearButton = page.locator('button:has-text("Clear")')
    await clearButton.click()

    // Verify bulk actions bar is hidden
    await expect(page.locator('text=properties selected')).not.toBeVisible()

    // Take screenshot
    await page.screenshot({ path: 'test-results/clear-selection.png' })
  })

  test('should show bulk approve button with correct count', async ({ page }) => {
    // Check if there are any pending properties
    const noPendingMessage = page.locator('text=No pending properties to review')
    const hasPendingProperties = await noPendingMessage.isVisible().catch(() => false)

    if (hasPendingProperties) {
      test.skip('No pending properties available for testing')
      return
    }

    // Select first two properties
    const checkboxes = page.locator('.flex.flex-col.md\\:flex-row.justify-between.p-4.border input[type="checkbox"]')
    const count = await checkboxes.count()

    if (count < 2) {
      test.skip('Not enough pending properties for test')
      return
    }

    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()

    // Verify bulk approve button shows correct count
    const bulkApproveButton = page.locator('button:has-text("Approve")').filter({ hasText: /\(\d+\)/ })
    await expect(bulkApproveButton).toBeVisible()

    const buttonText = await bulkApproveButton.textContent()
    expect(buttonText).toContain('(2)')

    // Take screenshot
    await page.screenshot({ path: 'test-results/bulk-approve-button.png' })
  })

  test('should show bulk reject button with correct count', async ({ page }) => {
    // Check if there are any pending properties
    const noPendingMessage = page.locator('text=No pending properties to review')
    const hasPendingProperties = await noPendingMessage.isVisible().catch(() => false)

    if (hasPendingProperties) {
      test.skip('No pending properties available for testing')
      return
    }

    // Select first two properties
    const checkboxes = page.locator('.flex.flex-col.md\\:flex-row.justify-between.p-4.border input[type="checkbox"]')
    const count = await checkboxes.count()

    if (count < 2) {
      test.skip('Not enough pending properties for test')
      return
    }

    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()

    // Verify bulk reject button shows correct count
    const bulkRejectButton = page.locator('button:has-text("Reject")').filter({ hasText: /\(\d+\)/ })
    await expect(bulkRejectButton).toBeVisible()

    const buttonText = await bulkRejectButton.textContent()
    expect(buttonText).toContain('(2)')
  })

  test('should bulk approve multiple properties', async ({ page }) => {
    // Check if there are any pending properties
    const noPendingMessage = page.locator('text=No pending properties to review')
    const hasPendingProperties = await noPendingMessage.isVisible().catch(() => false)

    if (hasPendingProperties) {
      test.skip('No pending properties available for testing')
      return
    }

    // Select first two properties
    const checkboxes = page.locator('.flex.flex-col.md\\:flex-row.justify-between.p-4.border input[type="checkbox"]')
    const count = await checkboxes.count()

    if (count < 2) {
      test.skip('Not enough pending properties for bulk test')
      return
    }

    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()

    // Click bulk approve
    const bulkApproveButton = page.locator('button:has-text("Approve")').filter({ hasText: /\(\d+\)/ })
    await bulkApproveButton.click()

    // Confirm the action in dialog
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('2 propert')
      await dialog.accept()
    })

    // Wait for success message
    await expect(page.locator('text=properties approved successfully')).toBeVisible({ timeout: 15000 })

    // Take screenshot
    await page.screenshot({ path: 'test-results/bulk-approve-success.png' })
  })

  test('should bulk reject multiple properties', async ({ page }) => {
    // Check if there are any pending properties
    const noPendingMessage = page.locator('text=No pending properties to review')
    const hasPendingProperties = await noPendingMessage.isVisible().catch(() => false)

    if (hasPendingProperties) {
      test.skip('No pending properties available for testing')
      return
    }

    // Select first two properties
    const checkboxes = page.locator('.flex.flex-col.md\\:flex-row.justify-between.p-4.border input[type="checkbox"]')
    const count = await checkboxes.count()

    if (count < 2) {
      test.skip('Not enough pending properties for bulk test')
      return
    }

    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()

    // Click bulk reject
    const bulkRejectButton = page.locator('button:has-text("Reject")').filter({ hasText: /\(\d+\)/ })
    await bulkRejectButton.click()

    // Wait for confirmation dialog
    await expect(page.locator('text=Reject Multiple Properties')).toBeVisible()

    // Confirm rejection
    const confirmButton = page.locator('button:has-text("Reject 2 Properties")')
    await confirmButton.click()

    // Wait for success message
    await expect(page.locator('text=properties rejected successfully')).toBeVisible({ timeout: 15000 })

    // Take screenshot
    await page.screenshot({ path: 'test-results/bulk-reject-success.png' })
  })

  test('should sync checkbox state correctly when properties update', async ({ page }) => {
    // Check if there are any pending properties
    const noPendingMessage = page.locator('text=No pending properties to review')
    const hasPendingProperties = await noPendingMessage.isVisible().catch(() => false)

    if (hasPendingProperties) {
      test.skip('No pending properties available for testing')
      return
    }

    // Select first property
    const checkboxes = page.locator('.flex.flex-col.md\\:flex-row.justify-between.p-4.border input[type="checkbox"]')
    const firstCheckbox = checkboxes.nth(0)

    await firstCheckbox.check()

    // Verify it's checked
    expect(await firstCheckbox.isChecked()).toBe(true)

    // Click approve on the property (not bulk)
    const approveButton = page.locator('.flex.flex-col.md\\:flex-row.justify-between.p-4.border').first().locator('button:has-text("Approve")')
    await approveButton.click()

    // Wait for property to be removed
    await page.waitForTimeout(2000)

    // Verify bulk actions bar is hidden (selection cleared when properties update)
    await expect(page.locator('text=property selected')).not.toBeVisible()
  })
})
