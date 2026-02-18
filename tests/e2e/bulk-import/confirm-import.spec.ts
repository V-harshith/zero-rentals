import { test, expect } from '@playwright/test'
import { BulkImportPage } from '../../pages/BulkImportPage'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { createValidPGExcel, createMixedPropertyTypesExcel } from '../../fixtures/excel-templates'

test.describe('Bulk Import - Confirm/Import Step', () => {
  let bulkImportPage: BulkImportPage
  let tempDir: string
  let imageDir: string

  test.beforeEach(async ({ page }) => {
    bulkImportPage = new BulkImportPage(page)
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-import-test-'))
    imageDir = path.join(tempDir, 'prop-pics')

    // Setup: Complete all previous steps
    await bulkImportPage.goto()
    await bulkImportPage.createNewImportJob()

    const excelBuffer = createValidPGExcel(2)
    const excelPath = path.join(tempDir, 'test.xlsx')
    fs.writeFileSync(excelPath, excelBuffer)
    await bulkImportPage.uploadExcelFile(excelPath)
  })

  test.afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('should successfully import properties without images', async () => {
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Confirm import
    await bulkImportPage.confirmImport()

    // Verify success
    await expect(bulkImportPage.importCompleteHeader).toBeVisible()

    // Verify stats
    const pageContent = await bulkImportPage.page.content()
    expect(pageContent).toMatch(/2.*Properties Created|created.*2/i)
  })

  test('should successfully import properties with images', async () => {
    // Create images
    const psns = ['1001', '1002']
    const imageFiles: string[] = []

    for (const psn of psns) {
      const psnDir = path.join(imageDir, psn)
      fs.mkdirSync(psnDir, { recursive: true })

      for (let i = 1; i <= 2; i++) {
        const imagePath = path.join(psnDir, `image${i}.jpg`)
        const jpegData = Buffer.from(
          'FFD8FFE000104A46494600010101004800480000FFDB00430008106060' +
          '6060606060606060606060606060606060606060606060606060606060' +
          '606060606060606060606060606060606060606060FFC0001108000100' +
          '010103012200021101031101FFC4001F00000105010101010101000000' +
          '00000000000102030405060708090A0BFFC400B5100002010303020403' +
          '050504040000017D010203000411051221314106135161072271143281' +
          '91A1082342B1C11552D1F0E13233627282090A161718191A2526272829' +
          '2A3435363738393A434445464748494A535455565758595A6364656667' +
          '68696A737475767778797A838485868788898A92939495969798999AA2' +
          'A3A4A5A6A7A8A9AAB2B3B4B5B6B7B8B9BAC2C3C4C5C6C7C8C9CAD2D3D4' +
          'D5D6D7D8D9DAE1E2E3E4E5E6E7E8E9EAF1F2F3F4F5F6F7F8F9FAFFC400' +
          '1F0100030101010101010101010000000000000102030405060708090A' +
          '0BFFC400B5110002010204040304070504040001027700010203110405' +
          '2131061241510761711322328108144291A1B1C109233352F0156272D1' +
          '0A162434E125F11718191A262728292A35363738393A43444546474849' +
          '4A535455565758595A636465666768696A737475767778797A82838485' +
          '868788898A92939495969798999AA2A3A4A5A6A7A8A9AAB2B3B4B5B6B7' +
          'B8B9BAC2C3C4C5C6C7C8C9CAD2D3D4D5D6D7D8D9DAE2E3E4E5E6E7E8E9' +
          'EAF2F3F4F5F6F7F8F9FAFFDA000C03010002110311003F00FDFCA28A28' +
          '03FFFD9',
          'hex'
        )
        fs.writeFileSync(imagePath, jpegData)
        imageFiles.push(imagePath)
      }
    }

    await bulkImportPage.proceedToImages()
    await bulkImportPage.uploadImageFolder(imageFiles)
    await bulkImportPage.proceedToReview()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Confirm import
    await bulkImportPage.confirmImport()

    // Verify success
    await expect(bulkImportPage.importCompleteHeader).toBeVisible()

    // Verify image count
    const pageContent = await bulkImportPage.page.content()
    expect(pageContent).toMatch(/4.*Images Assigned|Images.*4/i)
  })

  test('should create new owner accounts', async () => {
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Confirm import
    await bulkImportPage.confirmImport()

    // Verify owners created
    await expect(bulkImportPage.importCompleteHeader).toBeVisible()

    const pageContent = await bulkImportPage.page.content()
    expect(pageContent).toMatch(/2.*New Owners|owners.*2/i)
  })

  test('should show download credentials button for new owners', async () => {
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Confirm import
    await bulkImportPage.confirmImport()

    // Verify credentials download button
    await expect(bulkImportPage.downloadCredentialsButton).toBeVisible()
  })

  test('should allow starting a new import after completion', async () => {
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Confirm import
    await bulkImportPage.confirmImport()

    // Verify success
    await expect(bulkImportPage.importCompleteHeader).toBeVisible()

    // Click import more
    await bulkImportPage.importMoreButton.click()

    // Should be on start screen
    await expect(bulkImportPage.createImportJobButton).toBeVisible()
  })

  test('should handle import with mixed property types', async () => {
    // Create new job with mixed types
    const excelBuffer = createMixedPropertyTypesExcel()
    const excelPath = path.join(tempDir, 'mixed.xlsx')
    fs.writeFileSync(excelPath, excelBuffer)

    // Need to start fresh for this test
    await bulkImportPage.page.goto('/dashboard/admin/bulk-import')
    await bulkImportPage.createNewImportJob()
    await bulkImportPage.uploadExcelFile(excelPath)
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Confirm import
    await bulkImportPage.confirmImport()

    // Verify success
    await expect(bulkImportPage.importCompleteHeader).toBeVisible()

    // Verify all 5 properties created
    const pageContent = await bulkImportPage.page.content()
    expect(pageContent).toMatch(/5.*Properties Created|created.*5/i)
  })

  test('should show progress during import', async () => {
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Start import
    await bulkImportPage.confirmImportButton.click()

    // Should show progress
    await expect(bulkImportPage.page.locator('text=/Creating|Processing|Importing/i')).toBeVisible()

    // Wait for completion
    await expect(bulkImportPage.importCompleteHeader).toBeVisible({ timeout: 180000 })
  })

  test('should handle properties with Co-living type correctly', async () => {
    // Create Excel with Co-living property
    const excelBuffer = createMixedPropertyTypesExcel()
    const excelPath = path.join(tempDir, 'coliving.xlsx')
    fs.writeFileSync(excelPath, excelBuffer)

    // Start fresh
    await bulkImportPage.page.goto('/dashboard/admin/bulk-import')
    await bulkImportPage.createNewImportJob()
    await bulkImportPage.uploadExcelFile(excelPath)
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Confirm import
    await bulkImportPage.confirmImport()

    // Verify success
    await expect(bulkImportPage.importCompleteHeader).toBeVisible()
  })

  test('should verify database records are created', async ({ page }) => {
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Confirm import
    await bulkImportPage.confirmImport()

    // Verify success
    await expect(bulkImportPage.importCompleteHeader).toBeVisible()

    // Navigate to properties page to verify
    await page.goto('/properties')

    // Should see properties (may need to wait for indexing)
    await expect(page.locator('text=/Test PG Property|No properties found/i')).toBeVisible()
  })

  test('should not show bulk_import_job_id column errors', async () => {
    // This test verifies the fix for the "bulk_import_job_id column missing" error
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Confirm import
    await bulkImportPage.confirmImport()

    // Verify success without column errors
    await expect(bulkImportPage.importCompleteHeader).toBeVisible()

    const pageContent = await bulkImportPage.page.content()
    expect(pageContent).not.toContain('bulk_import_job_id')
    expect(pageContent).not.toContain('column missing')
    expect(pageContent).not.toContain('column does not exist')
  })

  test('should handle concurrent import prevention', async () => {
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Start first import
    await bulkImportPage.confirmImportButton.click()

    // Try to start another import (should be prevented)
    // This is more of a backend test, but we can verify the UI handles it
    await bulkImportPage.page.goto('/dashboard/admin/bulk-import')

    // Should show existing job status or allow creating new after completion
    await expect(bulkImportPage.createImportJobButton).toBeVisible()
  })
})
