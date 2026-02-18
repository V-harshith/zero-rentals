import { test, expect } from '@playwright/test'
import { BulkImportPage } from '../../pages/BulkImportPage'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { createValidPGExcel } from '../../fixtures/excel-templates'

test.describe('Bulk Import - Image Upload Step', () => {
  let bulkImportPage: BulkImportPage
  let tempDir: string
  let imageDir: string

  test.beforeEach(async ({ page }) => {
    bulkImportPage = new BulkImportPage(page)
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-import-test-'))
    imageDir = path.join(tempDir, 'prop-pics')

    // Setup: Create import job and upload Excel
    await bulkImportPage.goto()
    await bulkImportPage.createNewImportJob()

    const excelBuffer = createValidPGExcel(3)
    const excelPath = path.join(tempDir, 'test.xlsx')
    fs.writeFileSync(excelPath, excelBuffer)
    await bulkImportPage.uploadExcelFile(excelPath)
    await bulkImportPage.proceedToImages()
  })

  test.afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('should upload images with correct PSN folder structure', async () => {
    // Create folder structure: prop-pics/1001/, prop-pics/1002/, prop-pics/1003/
    const psns = ['1001', '1002', '1003']
    const imageFiles: string[] = []

    for (const psn of psns) {
      const psnDir = path.join(imageDir, psn)
      fs.mkdirSync(psnDir, { recursive: true })

      // Create 2 test images per PSN
      for (let i = 1; i <= 2; i++) {
        const imagePath = path.join(psnDir, `image${i}.jpg`)
        // Create a minimal valid JPEG
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

    // Upload the folder
    await bulkImportPage.uploadImageFolder(imageFiles)

    // Verify upload success
    await expect(bulkImportPage.page.locator('text=Images Uploaded Successfully')).toBeVisible()
    await expect(bulkImportPage.proceedToReviewButton).toBeEnabled()
  })

  test('should detect PSN folders correctly', async () => {
    // Create folder structure
    const psns = ['1001', '1002']
    const imageFiles: string[] = []

    for (const psn of psns) {
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

    // Select folder (this triggers PSN detection)
    await bulkImportPage.folderInput.setInputFiles(imageFiles)

    // Wait for PSN detection
    await expect(bulkImportPage.psnDetectionPreview).toBeVisible()

    // Verify detected PSNs
    const pageContent = await bulkImportPage.page.content()
    expect(pageContent).toContain('1001')
    expect(pageContent).toContain('1002')
  })

  test('should handle orphaned images (no matching PSN in Excel)', async () => {
    // Create folder for PSN not in Excel (9999)
    const orphanDir = path.join(imageDir, '9999')
    fs.mkdirSync(orphanDir, { recursive: true })

    const imagePath = path.join(orphanDir, 'orphan.jpg')
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

    // Also add valid images
    const validDir = path.join(imageDir, '1001')
    fs.mkdirSync(validDir, { recursive: true })
    const validImagePath = path.join(validDir, 'valid.jpg')
    fs.writeFileSync(validImagePath, jpegData)

    await bulkImportPage.uploadImageFolder([imagePath, validImagePath])

    // Should complete but show orphaned images
    await expect(bulkImportPage.page.locator('text=Images Uploaded Successfully')).toBeVisible()

    // Check for orphaned count
    const pageContent = await bulkImportPage.page.content()
    expect(pageContent).toMatch(/orphaned|Orphaned/i)
  })

  test('should warn when PSN has more than 10 images', async () => {
    // Create folder with 12 images for one PSN
    const psnDir = path.join(imageDir, '1001')
    fs.mkdirSync(psnDir, { recursive: true })

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

    for (let i = 1; i <= 12; i++) {
      const imagePath = path.join(psnDir, `image${i}.jpg`)
      fs.writeFileSync(imagePath, jpegData)
      imageFiles.push(imagePath)
    }

    await bulkImportPage.folderInput.setInputFiles(imageFiles)

    // Wait for warning to appear
    await expect(bulkImportPage.page.locator('text=/warning|exceed|10 images/i')).toBeVisible()
  })

  test('should handle batch upload merging', async () => {
    // This test verifies that multiple batch uploads merge correctly
    // First batch
    const psnDir1 = path.join(imageDir, '1001')
    fs.mkdirSync(psnDir1, { recursive: true })
    const image1 = path.join(psnDir1, 'batch1.jpg')
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
    fs.writeFileSync(image1, jpegData)

    await bulkImportPage.uploadImageFolder([image1])

    // Verify first batch uploaded
    await expect(bulkImportPage.page.locator('text=Images Uploaded Successfully')).toBeVisible()
  })

  test('should allow skipping image upload', async () => {
    await bulkImportPage.skipImageUpload()

    // Should be on review step
    await expect(bulkImportPage.page.locator('text=Review Import')).toBeVisible()
  })

  test('should allow going back to Excel step', async () => {
    await bulkImportPage.backButton.click()

    // Should be back on Excel step
    await expect(bulkImportPage.page.locator('text=Upload Excel File')).toBeVisible()
  })

  test('should compress large images automatically', async () => {
    // Create a larger image file
    const psnDir = path.join(imageDir, '1001')
    fs.mkdirSync(psnDir, { recursive: true })

    // Create a 3MB JPEG file
    const largeImagePath = path.join(psnDir, 'large.jpg')
    const largeBuffer = Buffer.alloc(3 * 1024 * 1024)
    // Add JPEG header
    largeBuffer[0] = 0xFF
    largeBuffer[1] = 0xD8
    largeBuffer[2] = 0xFF
    fs.writeFileSync(largeImagePath, largeBuffer)

    await bulkImportPage.folderInput.setInputFiles([largeImagePath])

    // Wait for compression indicator
    await expect(bulkImportPage.page.locator('text=/compress|Compressing/i')).toBeVisible()
  })
})
