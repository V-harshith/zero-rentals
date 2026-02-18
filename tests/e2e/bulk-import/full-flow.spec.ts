import { test, expect } from '@playwright/test'
import { BulkImportPage } from '../../pages/BulkImportPage'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { createValidPGExcel, createMixedPropertyTypesExcel } from '../../fixtures/excel-templates'

/**
 * Full end-to-end test of the bulk import feature
 * Tests the complete workflow from start to finish
 */
test.describe('Bulk Import - Full End-to-End Flow', () => {
  let bulkImportPage: BulkImportPage
  let tempDir: string
  let imageDir: string

  test.beforeEach(async ({ page }) => {
    bulkImportPage = new BulkImportPage(page)
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-import-e2e-'))
    imageDir = path.join(tempDir, 'prop-pics')
  })

  test.afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('complete flow: Excel upload → Images → Review → Import → Results', async () => {
    // Step 1: Navigate and create job
    await bulkImportPage.goto()
    await expect(bulkImportPage.createImportJobButton).toBeVisible()
    await bulkImportPage.createNewImportJob()
    await expect(await bulkImportPage.isOnExcelStep()).toBe(true)

    // Step 2: Upload Excel with 3 PG properties
    const excelBuffer = createValidPGExcel(3)
    const excelPath = path.join(tempDir, 'complete-flow.xlsx')
    fs.writeFileSync(excelPath, excelBuffer)
    await bulkImportPage.uploadExcelFile(excelPath)

    // Verify Excel parsing results
    await expect(bulkImportPage.excelResultSection).toBeVisible()
    const stats = await bulkImportPage.getSummaryStats()
    expect(stats).toBeDefined()

    // Step 3: Proceed to images
    await bulkImportPage.proceedToImages()
    await expect(await bulkImportPage.isOnImagesStep()).toBe(true)

    // Step 4: Create and upload images
    const psns = ['1001', '1002', '1003']
    const imageFiles: string[] = []

    for (const psn of psns) {
      const psnDir = path.join(imageDir, psn)
      fs.mkdirSync(psnDir, { recursive: true })

      // Create 3 images per property
      for (let i = 1; i <= 3; i++) {
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

    await bulkImportPage.uploadImageFolder(imageFiles)
    await expect(bulkImportPage.page.locator('text=Images Uploaded Successfully')).toBeVisible()

    // Verify PSN detection
    const pageContent = await bulkImportPage.page.content()
    expect(pageContent).toContain('1001')
    expect(pageContent).toContain('1002')
    expect(pageContent).toContain('1003')

    // Step 5: Proceed to review
    await bulkImportPage.proceedToReview()
    await expect(await bulkImportPage.isOnReviewStep()).toBe(true)

    // Verify review data
    const propertyCount = await bulkImportPage.getPropertyCountInPreview()
    expect(propertyCount).toBe(3)

    // Verify summary cards
    await expect(bulkImportPage.page.locator('text=Properties').first()).toBeVisible()
    await expect(bulkImportPage.page.locator('text=New Owners').first()).toBeVisible()
    await expect(bulkImportPage.page.locator('text=Images').first()).toBeVisible()

    // Step 6: Confirm import
    await bulkImportPage.confirmImport()
    await expect(await bulkImportPage.isOnResultsStep()).toBe(true)

    // Step 7: Verify results
    await expect(bulkImportPage.importCompleteHeader).toBeVisible()

    // Verify stats
    const resultsContent = await bulkImportPage.page.content()
    expect(resultsContent).toMatch(/3.*Properties Created|created.*3/i)
    expect(resultsContent).toMatch(/3.*New Owners|owners.*3/i)
    expect(resultsContent).toMatch(/9.*Images Assigned|Images.*9/i)

    // Verify credentials download available
    await expect(bulkImportPage.downloadCredentialsButton).toBeVisible()

    // Step 8: Start new import
    await bulkImportPage.importMoreButton.click()
    await expect(bulkImportPage.createImportJobButton).toBeVisible()
  })

  test('full flow with mixed property types and partial images', async () => {
    // Create Excel with mixed types
    const excelBuffer = createMixedPropertyTypesExcel()
    const excelPath = path.join(tempDir, 'mixed-flow.xlsx')
    fs.writeFileSync(excelPath, excelBuffer)

    // Start flow
    await bulkImportPage.goto()
    await bulkImportPage.createNewImportJob()

    // Upload Excel
    await bulkImportPage.uploadExcelFile(excelPath)
    await expect(bulkImportPage.excelResultSection).toBeVisible()

    // Proceed to images
    await bulkImportPage.proceedToImages()

    // Create images for only some properties (1001, 2001, 3001)
    const psnsWithImages = ['1001', '2001', '3001']
    const imageFiles: string[] = []

    for (const psn of psnsWithImages) {
      const psnDir = path.join(imageDir, psn)
      fs.mkdirSync(psnDir, { recursive: true })

      const imagePath = path.join(psnDir, 'image1.jpg')
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

    await bulkImportPage.uploadImageFolder(imageFiles)
    await bulkImportPage.proceedToReview()

    // Verify warning for properties without images
    await expect(bulkImportPage.page.locator('text=/without images|will be imported without/i')).toBeVisible()

    // Confirm import
    await bulkImportPage.confirmImport()

    // Verify results
    await expect(bulkImportPage.importCompleteHeader).toBeVisible()

    const resultsContent = await bulkImportPage.page.content()
    expect(resultsContent).toMatch(/5.*Properties Created|created.*5/i)
  })

  test('full flow with orphaned images', async () => {
    const excelBuffer = createValidPGExcel(2)
    const excelPath = path.join(tempDir, 'orphan-test.xlsx')
    fs.writeFileSync(excelPath, excelBuffer)

    await bulkImportPage.goto()
    await bulkImportPage.createNewImportJob()
    await bulkImportPage.uploadExcelFile(excelPath)
    await bulkImportPage.proceedToImages()

    // Create images including orphaned ones
    const validPsns = ['1001', '1002']
    const orphanPsns = ['9998', '9999']
    const imageFiles: string[] = []

    for (const psn of [...validPsns, ...orphanPsns]) {
      const psnDir = path.join(imageDir, psn)
      fs.mkdirSync(psnDir, { recursive: true })

      const imagePath = path.join(psnDir, 'image1.jpg')
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

    await bulkImportPage.uploadImageFolder(imageFiles)
    await bulkImportPage.proceedToReview()

    // Verify orphaned images warning
    await expect(bulkImportPage.page.locator('text=/orphaned|don\'t match any PSN/i')).toBeVisible()

    // Confirm import
    await bulkImportPage.confirmImport()

    // Verify success
    await expect(bulkImportPage.importCompleteHeader).toBeVisible()
  })

  test('verify no console errors during full flow', async ({ page }) => {
    const consoleErrors: string[] = []

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    page.on('pageerror', error => {
      consoleErrors.push(error.message)
    })

    // Run full flow
    const excelBuffer = createValidPGExcel(1)
    const excelPath = path.join(tempDir, 'console-test.xlsx')
    fs.writeFileSync(excelPath, excelBuffer)

    await bulkImportPage.goto()
    await bulkImportPage.createNewImportJob()
    await bulkImportPage.uploadExcelFile(excelPath)
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()
    await bulkImportPage.confirmImport()

    await expect(bulkImportPage.importCompleteHeader).toBeVisible()

    // Check for critical console errors
    const criticalErrors = consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('source map') &&
      !e.includes('Source map')
    )

    expect(criticalErrors).toHaveLength(0)
  })

  test('verify network requests succeed', async ({ page }) => {
    const failedRequests: string[] = []

    page.on('response', response => {
      if (response.status() >= 400) {
        failedRequests.push(`${response.status()}: ${response.url()}`)
      }
    })

    // Run full flow
    const excelBuffer = createValidPGExcel(1)
    const excelPath = path.join(tempDir, 'network-test.xlsx')
    fs.writeFileSync(excelPath, excelBuffer)

    await bulkImportPage.goto()
    await bulkImportPage.createNewImportJob()
    await bulkImportPage.uploadExcelFile(excelPath)
    await bulkImportPage.proceedToImages()
    await bulkImportPage.skipImageUpload()
    await bulkImportPage.confirmImport()

    await expect(bulkImportPage.importCompleteHeader).toBeVisible()

    // Check for failed API requests (excluding expected 404s)
    const apiFailures = failedRequests.filter(url =>
      url.includes('/api/') &&
      !url.includes('favicon')
    )

    expect(apiFailures).toHaveLength(0)
  })
})
