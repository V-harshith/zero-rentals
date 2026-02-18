import { Page, Locator, expect } from '@playwright/test'

/**
 * Page Object Model for Bulk Import Page
 */
export class BulkImportPage {
  readonly page: Page
  readonly url: string = '/dashboard/admin/bulk-import'

  // Navigation
  readonly newImportTab: Locator
  readonly historyTab: Locator

  // Start Screen
  readonly createImportJobButton: Locator
  readonly downloadTemplateButton: Locator

  // Step Indicators
  readonly excelStepIndicator: Locator
  readonly imagesStepIndicator: Locator
  readonly reviewStepIndicator: Locator

  // Excel Upload Step
  readonly excelUploadArea: Locator
  readonly fileInput: Locator
  readonly uploadExcelButton: Locator
  readonly proceedToImagesButton: Locator
  readonly excelResultSection: Locator
  readonly excelErrorAlert: Locator

  // Image Upload Step
  readonly imageUploadArea: Locator
  readonly folderInput: Locator
  readonly uploadImagesButton: Locator
  readonly proceedToReviewButton: Locator
  readonly psnDetectionPreview: Locator
  readonly skipImagesButton: Locator
  readonly backButton: Locator

  // Review Step
  readonly confirmImportButton: Locator
  readonly propertyPreviewList: Locator
  readonly summaryCards: Locator
  readonly warningAlerts: Locator

  // Results Step
  readonly importCompleteHeader: Locator
  readonly downloadCredentialsButton: Locator
  readonly viewPropertiesLink: Locator
  readonly importMoreButton: Locator

  // Progress
  readonly progressBar: Locator
  readonly statusText: Locator

  constructor(page: Page) {
    this.page = page

    // Navigation tabs
    this.newImportTab = page.getByRole('tab', { name: /New Import/i })
    this.historyTab = page.getByRole('tab', { name: /History/i })

    // Start screen
    this.createImportJobButton = page.getByRole('button', { name: /Create Import Job/i })
    this.downloadTemplateButton = page.getByRole('button', { name: /Download Template/i })

    // Step indicators - using text content
    this.excelStepIndicator = page.locator('[data-testid="step-excel"], text=Excel')
    this.imagesStepIndicator = page.locator('[data-testid="step-images"], text=Images')
    this.reviewStepIndicator = page.locator('[data-testid="step-review"], text=Review')

    // Excel Upload Step
    this.excelUploadArea = page.locator('text=Click to select Excel file')
    this.fileInput = page.locator('input[type="file"][accept=".xlsx,.xls"]')
    this.uploadExcelButton = page.getByRole('button', { name: /Upload and Parse Excel/i })
    this.proceedToImagesButton = page.getByRole('button', { name: /Next: Upload Images/i })
    this.excelResultSection = page.locator('text=Excel Parsed Successfully')
    this.excelErrorAlert = page.locator('[role="alert"]:has-text("error"), .text-red-600')

    // Image Upload Step
    this.imageUploadArea = page.locator('text=Click to select folder')
    this.folderInput = page.locator('input[type="file"][webkitdirectory]')
    this.uploadImagesButton = page.getByRole('button', { name: /Upload.*Images/i })
    this.proceedToReviewButton = page.getByRole('button', { name: /Next: Review Import/i })
    this.psnDetectionPreview = page.locator('text=Detected PSN folders')
    this.skipImagesButton = page.getByRole('button', { name: /Skip Images/i })
    this.backButton = page.getByRole('button', { name: /Back/i })

    // Review Step
    this.confirmImportButton = page.getByRole('button', { name: /Confirm Import/i })
    this.propertyPreviewList = page.locator('text=Properties Preview')
    this.summaryCards = page.locator('[class*="Card"]').filter({ hasText: /Properties|Owners|Images/ })
    this.warningAlerts = page.locator('[role="alert"]:has-text("⚠")')

    // Results Step
    this.importCompleteHeader = page.locator('text=Import Complete!')
    this.downloadCredentialsButton = page.getByRole('button', { name: /Download CSV/i })
    this.viewPropertiesLink = page.locator('text=View Properties')
    this.importMoreButton = page.getByRole('button', { name: /Import More Properties/i })

    // Progress
    this.progressBar = page.locator('[role="progressbar"]')
    this.statusText = page.locator('text=/Uploading|Processing|Creating/')
  }

  async goto() {
    await this.page.goto(this.url)
    await this.page.waitForLoadState('networkidle')
  }

  async createNewImportJob() {
    await this.createImportJobButton.click()
    await this.page.waitForSelector('text=Upload Excel File', { timeout: 10000 })
  }

  async uploadExcelFile(filePath: string) {
    // Wait for file input and upload
    await this.fileInput.setInputFiles(filePath)
    await this.uploadExcelButton.click()
    // Wait for parsing to complete
    await this.page.waitForSelector('text=/Excel Parsed Successfully|No Valid Properties|error/i', { timeout: 30000 })
  }

  async uploadExcelBuffer(buffer: Buffer, filename: string) {
    await this.fileInput.setInputFiles({ name: filename, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer })
    await this.uploadExcelButton.click()
    await this.page.waitForSelector('text=/Excel Parsed Successfully|No Valid Properties|error/i', { timeout: 30000 })
  }

  async proceedToImages() {
    await this.proceedToImagesButton.click()
    await this.page.waitForSelector('text=Upload Image Folder', { timeout: 10000 })
  }

  async uploadImageFolder(filePaths: string[]) {
    await this.folderInput.setInputFiles(filePaths)
    // Wait for compression to complete
    await this.page.waitForTimeout(2000)
    await this.uploadImagesButton.click()
    // Wait for upload to complete
    await this.page.waitForSelector('text=/Images Uploaded Successfully|Upload Failed/i', { timeout: 120000 })
  }

  async skipImageUpload() {
    await this.skipImagesButton.click()
    await this.page.waitForSelector('text=Review Import', { timeout: 10000 })
  }

  async proceedToReview() {
    await this.proceedToReviewButton.click()
    await this.page.waitForSelector('text=Review Import', { timeout: 10000 })
  }

  async confirmImport() {
    await this.confirmImportButton.click()
    // Wait for import to complete
    await this.page.waitForSelector('text=/Import Complete!|Import Completed with Errors/i', { timeout: 180000 })
  }

  async getExcelParseResults() {
    const resultText = await this.page.locator('text=/Total Rows|Valid|New Owners/i').first().textContent()
    return resultText
  }

  async getSummaryStats() {
    const stats: Record<string, string> = {}
    const cards = await this.summaryCards.all()
    for (const card of cards) {
      const text = await card.textContent()
      if (text) {
        const match = text.match(/(\d+)\s*(\w+)/)
        if (match) {
          stats[match[2]] = match[1]
        }
      }
    }
    return stats
  }

  async isOnExcelStep(): Promise<boolean> {
    return await this.page.locator('text=Upload Excel File').isVisible()
  }

  async isOnImagesStep(): Promise<boolean> {
    return await this.page.locator('text=Upload Image Folder').isVisible()
  }

  async isOnReviewStep(): Promise<boolean> {
    return await this.page.locator('text=Review Import').isVisible()
  }

  async isOnResultsStep(): Promise<boolean> {
    return await this.page.locator('text=/Import Complete!|Import Completed with Errors/i').isVisible()
  }

  async hasErrors(): Promise<boolean> {
    const errorElements = await this.page.locator('[role="alert"]:has-text("error"), .text-red-600, .bg-red-50').count()
    return errorElements > 0
  }

  async getErrorMessages(): Promise<string[]> {
    const errors = await this.page.locator('[role="alert"], .text-red-600').allTextContents()
    return errors.filter(e => e && e.trim().length > 0)
  }

  async waitForProgressComplete(timeout: number = 120000) {
    await this.page.waitForFunction(() => {
      const progressBar = document.querySelector('[role="progressbar"]')
      if (progressBar) {
        const value = progressBar.getAttribute('aria-valuenow')
        return value === '100'
      }
      return false
    }, { timeout })
  }

  async downloadTemplate() {
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.downloadTemplateButton.click(),
    ])
    return download
  }

  async getPropertyCountInPreview(): Promise<number> {
    const text = await this.page.locator('text=/Properties Preview \(/').textContent()
    const match = text?.match(/\((\d+)\)/)
    return match ? parseInt(match[1], 10) : 0
  }

  async getImageCountForProperty(psn: string): Promise<number> {
    const row = this.page.locator(`text=${psn}`).locator('..').locator('..')
    const badge = row.locator('text=/images/')
    const text = await badge.textContent()
    const match = text?.match(/(\d+)/)
    return match ? parseInt(match[1], 10) : 0
  }
}
