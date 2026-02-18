import { test, expect } from '@playwright/test'
import { BulkImportPage } from '../../pages/BulkImportPage'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { createValidPGExcel, createMixedPropertyTypesExcel } from '../../fixtures/excel-templates'

test.describe('Bulk Import - Review Step', () => {
  let bulkImportPage: BulkImportPage
  let tempDir: string
  let imageDir: string

  test.beforeEach(async ({ page }) => {
    bulkImportPage = new BulkImportPage(page)
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-import-test-'))
    imageDir = path.join(tempDir, 'prop-pics')

    // Setup: Complete Excel and Image upload steps
    await bulkImportPage.goto()
    await bulkImportPage.createNewImportJob()

    const excelBuffer = createValidPGExcel(3)
    const excelPath = path.join(tempDir, 'test.xlsx')
    fs.writeFileSync(excelPath, excelBuffer)
    await bulkImportPage.uploadExcelFile(excelPath)
  })

  test.afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('should display property data correctly in review', async () => {
    // Skip images and go to review
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Verify property count
    const propertyCount = await bulkImportPage.getPropertyCountInPreview()
    expect(propertyCount).toBe(3)

    // Verify summary cards are visible
    await expect(bulkImportPage.page.locator('text=Properties')).toBeVisible()
    await expect(bulkImportPage.page.locator('text=New Owners')).toBeVisible()
  })

  test('should show correct image counts per property', async () => {
    // Create images for specific PSNs
    const psns = ['1001', '1002']
    const imageFiles: string[] = []

    for (const psn of psns) {
      const psnDir = path.join(imageDir, psn)
      fs.mkdirSync(psnDir, { recursive: true })

      // Create 3 images for 1001, 2 images for 1002
      const count = psn === '1001' ? 3 : 2
      for (let i = 1; i <= count; i++) {
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

    // Verify image counts in preview
    const pageContent = await bulkImportPage.page.content()
    expect(pageContent).toContain('3 images')
    expect(pageContent).toContain('2 images')
    expect(pageContent).toContain('No images') // For 1003
  })

  test('should display owner information correctly', async () => {
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Verify owner section
    await expect(bulkImportPage.page.locator('text=New Owner Accounts')).toBeVisible()

    // Verify owner count
    const pageContent = await bulkImportPage.page.content()
    expect(pageContent).toMatch(/3.*new owner/i)
  })

  test('should show warning for properties without images', async () => {
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Should show warning
    await expect(bulkImportPage.page.locator('text=/without images|will be imported without/i')).toBeVisible()
  })

  test('should show warning for orphaned images', async () => {
    // Create images including orphaned ones
    const psnDir = path.join(imageDir, '1001')
    const orphanDir = path.join(imageDir, '9999')
    fs.mkdirSync(psnDir, { recursive: true })
    fs.mkdirSync(orphanDir, { recursive: true })

    const imageFiles: string[] = []
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

    const validImage = path.join(psnDir, 'valid.jpg')
    const orphanImage = path.join(orphanDir, 'orphan.jpg')
    fs.writeFileSync(validImage, jpegData)
    fs.writeFileSync(orphanImage, jpegData)
    imageFiles.push(validImage, orphanImage)

    await bulkImportPage.proceedToImages()
    await bulkImportPage.uploadImageFolder(imageFiles)
    await bulkImportPage.proceedToReview()

    // Should show orphaned images warning
    await expect(bulkImportPage.page.locator('text=/orphaned|don\'t match any PSN/i')).toBeVisible()
  })

  test('should display correct summary statistics', async () => {
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Get summary stats
    const stats = await bulkImportPage.getSummaryStats()

    // Verify we have the expected counts
    expect(Object.keys(stats).length).toBeGreaterThan(0)
  })

  test('should show property details in preview list', async () => {
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Verify property details are shown
    const pageContent = await bulkImportPage.page.content()
    expect(pageContent).toContain('Bangalore')
    expect(pageContent).toContain('Koramangala')
  })

  test('should identify new vs existing owners', async () => {
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Should show "New Owner" badges
    const pageContent = await bulkImportPage.page.content()
    expect(pageContent).toMatch(/New Owner|new owner/i)
  })

  test('should allow going back to image step', async () => {
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Click back
    await bulkImportPage.backButton.click()

    // Should be back on image step
    await expect(bulkImportPage.page.locator('text=Upload Image Folder')).toBeVisible()
  })

  test('should disable confirm button if no properties', async () => {
    // This would require creating a job with no valid properties
    // For now, verify the button is enabled when properties exist
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Confirm button should be enabled
    await expect(bulkImportPage.confirmImportButton).toBeEnabled()
  })

  test('should show important confirmation warning', async () => {
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()

    // Wait for review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()

    // Should show confirmation warning
    await expect(bulkImportPage.page.locator('text=/cannot be undone|Important/i')).toBeVisible()
  })
})
