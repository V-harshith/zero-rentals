/**
 * Bulk Import System - Type Definitions
 *
 * Centralized TypeScript types for the bulk import feature.
 * All types are strict - no 'any' allowed.
 */

// ============================================================================
// Core Entity Types
// ============================================================================

/**
 * Property Serial Number - unique identifier for bulk import
 */
export type PSN = string

/**
 * Job status in the bulk import lifecycle
 */
export type ImportJobStatus =
    | 'created'
    | 'parsing_excel'
    | 'excel_parsed'
    | 'uploading_images'
    | 'images_uploaded'
    | 'ready'
    | 'processing'
    | 'completed'
    | 'completed_with_errors'
    | 'failed'

/**
 * Import step for UI progression
 */
export type ImportStep = 'upload' | 'image_upload' | 'review' | 'results'

// ============================================================================
// Parsed Data Types
// ============================================================================

/**
 * Property data parsed from Excel
 */
export interface ParsedProperty {
    row_number: number
    psn: PSN
    property_name: string
    owner_email: string
    owner_name: string
    owner_phone: string
    property_data: PropertyData
}

/**
 * Property data structure for database insertion
 */
export interface PropertyData {
    title: string
    description: string
    property_type: 'PG' | 'Co-living' | 'Rent'
    room_type: string
    city: string
    area: string
    locality: string
    address: string
    landmark: string
    google_maps_url: string
    country: string
    owner_contact: string
    one_rk_price: number | null
    private_room_price: number | null
    double_sharing_price: number | null
    triple_sharing_price: number | null
    four_sharing_price: number | null
    deposit: number | null
    amenities: string[]
    preferred_tenant: 'Male' | 'Female' | 'Couple' | null
    usp: string
    status: 'active'
    availability: 'Available'
    featured: boolean
    verified: boolean
    views: number
    source: 'bulk_import'
    psn: PSN
    owner_verified: boolean
    laundry: boolean
    room_cleaning: boolean
    warden: boolean
    parking: 'Bike' | 'None'
}

/**
 * New owner extracted from Excel
 */
export interface NewOwner {
    email: string
    name: string
    phone: string
    password: string
    properties: string[]
}

/**
 * New owner with encrypted password (for database storage)
 */
export interface NewOwnerEncrypted {
    email: string
    name: string
    phone: string
    password_encrypted: string
    properties: string[]
}

// ============================================================================
// Image Types
// ============================================================================

/**
 * Staged image uploaded to temporary storage
 */
export interface StagedImage {
    id?: string
    filename: string
    original_path: string
    extracted_psn: PSN
    storage_path: string
    file_size: number
    mime_type: string
    public_url?: string
    status?: 'pending' | 'uploaded' | 'failed' | 'orphaned'
    error_message?: string
}

/**
 * Image grouped by PSN for processing
 */
export interface ImagesByPSN {
    [psn: string]: StagedImage[]
}

/**
 * Image file with metadata for upload
 */
export interface ImageFile {
    file: File
    filename: string
    relativePath: string
    psn: PSN
}

// ============================================================================
// Job Types
// ============================================================================

/**
 * Bulk import job from database
 */
export interface ImportJob {
    id: string
    admin_id: string
    status: ImportJobStatus
    step: ImportStep
    excel_file_name?: string
    excel_file_size?: number
    total_properties: number
    parsed_properties: ParsedProperty[]
    new_owners: NewOwnerEncrypted[]
    existing_owners_matched: number
    images_by_psn: ImagesByPSN
    orphaned_images: StagedImage[]
    total_images: number
    processed_properties: number
    failed_properties: number
    error_message?: string
    error_details?: Record<string, unknown>
    created_at: string
    updated_at: string
    excel_uploaded_at?: string
    images_uploaded_at?: string
    completed_at?: string
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of property creation
 */
export interface PropertyCreationResult {
    success: boolean
    propertyId?: string
    psn: PSN
    error?: string
    imageMoveErrors?: string[]
}

/**
 * Result of owner creation
 */
export interface OwnerCreationResult {
    success: boolean
    userId?: string
    email: string
    error?: string
    password?: string
}

/**
 * Import results for display
 */
export interface ImportResults {
    success: boolean
    total: number
    created: number
    failed: number
    properties: PropertyCreationResult[]
    owners: OwnerCreationResult[]
    credentials: OwnerCredential[]
}

/**
 * Owner credentials for download
 */
export interface OwnerCredential {
    email: string
    name: string
    password: string
    properties: string[]
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Excel upload response
 */
export interface ExcelUploadResponse {
    success: boolean
    total_rows: number
    valid_properties: number
    errors: string[]
    new_owners: number
    existing_owners: number
    psn_list: PSN[]
}

/**
 * Image upload progress response
 */
export interface ImageUploadProgress {
    status: string
    progress: number
    total?: number
    processed?: number
    failed?: number
    matched_psns?: number
    orphaned_count?: number
    warnings?: string[]
    error?: string
}

/**
 * Confirm import response
 */
export interface ConfirmImportResponse {
    status: string
    progress: number
    completed?: boolean
    success?: boolean
    error?: string
    results?: ImportResults
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Column mapping for Excel parsing
 */
export interface ColumnMapping {
    [key: string]: string[]
}

/**
 * Amenity mapping entry
 */
export interface AmenityMap {
    [key: string]: string
}

/**
 * Validation error for Excel row
 */
export interface ValidationError {
    row: number
    field: string
    message: string
}

/**
 * Idempotency record for operation tracking
 */
export interface IdempotencyRecord {
    operation_key: string
    status: 'pending' | 'processing' | 'completed' | 'failed'
    result?: Record<string, unknown>
    created_at: string
    updated_at: string
}

// ============================================================================
// Component Props Types
// ============================================================================

/**
 * Props for Excel upload step
 */
export interface ExcelUploadStepProps {
    jobId: string
    onComplete: (result: ExcelUploadResponse) => void
    onError: (error: string) => void
}

/**
 * Props for image upload step
 */
export interface ImageUploadStepProps {
    jobId: string
    expectedPSNs: PSN[]
    onComplete: (result: ImageUploadProgress) => void
    onError: (error: string) => void
}

/**
 * Props for review step
 */
export interface ReviewStepProps {
    jobId: string
    properties: ParsedProperty[]
    imagesByPSN: ImagesByPSN
    newOwners: NewOwnerEncrypted[]
    existingOwnersCount: number
    onConfirm: () => void
    onBack: () => void
}

/**
 * Props for results step
 */
export interface ResultsStepProps {
    jobId: string
    results: ImportResults
    onDownloadCredentials: () => void
    onClose: () => void
}
