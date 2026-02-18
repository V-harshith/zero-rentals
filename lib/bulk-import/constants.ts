/**
 * Bulk Import System - Constants
 *
 * All magic numbers and limits centralized for easy configuration.
 */

// ============================================================================
// Image Upload Limits
// ============================================================================

/** Maximum images allowed per PSN (Property Serial Number) */
export const MAX_IMAGES_PER_PSN = 10

/** Maximum total images allowed per import job */
export const MAX_TOTAL_IMAGES = 500

/** Maximum file size for individual images (10MB on server) */
export const MAX_FILE_SIZE_SERVER = 10 * 1024 * 1024

/** Maximum file size after client compression (2MB) */
export const MAX_FILE_SIZE_CLIENT = 2 * 1024 * 1024

/** Maximum batch size for image uploads (3MB for Vercel free tier) */
export const MAX_BATCH_SIZE_MB = 3.0

/** Maximum files per batch upload */
export const MAX_FILES_PER_BATCH = 4

/** Maximum concurrent uploads */
export const MAX_CONCURRENT_UPLOADS = 3

// ============================================================================
// Excel Parsing Limits
// ============================================================================

/** Maximum rows to process in Excel file */
export const MAX_EXCEL_ROWS = 1000

/** Maximum file size for Excel uploads (5MB) */
export const MAX_EXCEL_FILE_SIZE = 5 * 1024 * 1024

// ============================================================================
// Password Generation
// ============================================================================

/** Default password length for generated owner passwords */
export const DEFAULT_PASSWORD_LENGTH = 12

/** Characters used for password generation */
export const PASSWORD_CHARS = {
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    numbers: '0123456789',
    symbols: '!@#$%^&*',
}

// ============================================================================
// Database Defaults
// ============================================================================

/** Default country for properties */
export const DEFAULT_COUNTRY = 'India'

/** Default property status */
export const DEFAULT_PROPERTY_STATUS = 'active'

/** Default availability status */
export const DEFAULT_AVAILABILITY = 'Available'

/** Default parking value */
export const DEFAULT_PARKING = 'None'

// ============================================================================
// Retry Configuration
// ============================================================================

/** Maximum retry attempts for failed operations */
export const MAX_RETRY_ATTEMPTS = 3

/** Base delay for exponential backoff (ms) */
export const RETRY_BASE_DELAY_MS = 1000

/** Maximum delay between retries (ms) */
export const RETRY_MAX_DELAY_MS = 10000

// ============================================================================
// Timeouts (milliseconds)
// ============================================================================

/** Timeout for image upload operations */
export const IMAGE_UPLOAD_TIMEOUT_MS = 30000

/** Timeout for Excel parsing operations */
export const EXCEL_PARSE_TIMEOUT_MS = 30000

/** Timeout for property creation operations */
export const PROPERTY_CREATION_TIMEOUT_MS = 60000

// ============================================================================
// UI Configuration
// ============================================================================

/** Debounce delay for search inputs (ms) */
export const SEARCH_DEBOUNCE_MS = 300

/** Animation duration for UI transitions (ms) */
export const UI_ANIMATION_DURATION_MS = 200

/** Maximum items to show in preview before collapsing */
export const MAX_PREVIEW_ITEMS = 5
