# Unified Bulk Import System with Images - Implementation Plan

## Executive Summary

Transform the current separate Excel and image upload flows into a single, unified bulk import system. Admin uploads one Excel file + one folder of images, and the system automatically connects everything by PSN.

---

## Current State Analysis

### What's Working:
1. **Excel Upload** (`/api/admin/bulk-upload`)
   - Parses Excel, creates owner accounts from Email column
   - Generates random passwords for new owners
   - Creates properties with PSN field
   - Returns downloadable credentials CSV
   - Upload history tracking

2. **Image Upload** (`/admin/bulk-image-upload`)
   - Stages images with PSN extraction from filename
   - Matches staged images to properties by PSN
   - Compresses images automatically

### What's Missing:
1. ❌ No unified interface for both uploads
2. ❌ No folder upload support (only individual file selection)
3. ❌ No automatic image-to-property linking during Excel import
4. ❌ Admin must navigate between two separate pages
5. ❌ No preview before final commit

---

## Proposed Solution: Unified 3-Step Wizard

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: Upload Excel    STEP 2: Upload Images    STEP 3: Review │
│  [====================>][====================>][================│
└─────────────────────────────────────────────────────────────────┘
```

### Flow Overview:

**Step 1: Excel Upload & Validation**
- Admin selects Excel file
- System validates columns and data
- Shows preview of properties to be created
- Shows owner accounts that will be created
- Extracts PSN numbers for image matching

**Step 2: Image Folder Upload**
- Admin selects entire folder of images
- System scans all files recursively
- Extracts PSN from filenames (e.g., "155.jpg", "155/photo1.jpg")
- Matches images to properties from Step 1
- Shows unmatched images (orphans)
- Compresses and stages images

**Step 3: Review & Confirm**
- Shows complete preview:
  - Properties to create (with owner details)
  - Images matched to each property
  - Missing images warnings
- Admin reviews and confirms
- Atomic import: Properties → Images → Owners notified

**Step 4: Results & Credentials Download**
- Success/failure summary
- Download credentials CSV for new owners
- Properties visible immediately in search

---

## Detailed Implementation

### Phase 1: Backend API Changes

#### 1.1 Create Unified Job Tracking

**File:** `app/api/admin/bulk-import/jobs/route.ts` (NEW)

```typescript
// Single job tracks both Excel and images
interface BulkImportJob {
  id: string;
  admin_id: string;
  status: 'uploading_excel' | 'validating' | 'uploading_images' |
          'matching' | 'ready_for_review' | 'processing' |
          'completed' | 'failed' | 'cancelled';

  // Excel data
  excel_file_name: string;
  parsed_properties: PropertyPreview[];
  validation_errors: ValidationError[];

  // Image data
  images_total: number;
  images_uploaded: number;
  images_by_psn: Record<string, StagedImage[]>;
  orphaned_images: StagedImage[];

  // Results
  new_owners: OwnerCredential[];
  created_property_ids: string[];
  errors: string[];
}
```

#### 1.2 Unified Upload Endpoints

**Consolidate into single workflow:**

```
POST   /api/admin/bulk-import/jobs              # Create new job
POST   /api/admin/bulk-import/jobs/[id]/excel   # Upload & parse Excel
POST   /api/admin/bulk-import/jobs/[id]/images  # Upload image folder
GET    /api/admin/bulk-import/jobs/[id]/status  # Get current status
POST   /api/admin/bulk-import/jobs/[id]/confirm # Execute final import
DELETE /api/admin/bulk-import/jobs/[id]         # Cancel and cleanup
GET    /api/admin/bulk-import/jobs/[id]/credentials  # Download CSV
```

**Remove/Deprecate:**
- `/api/admin/import-properties` (legacy)
- `/api/admin/bulk-upload` (replaced)
- `/api/admin/bulk-image-upload` (replaced)

#### 1.3 Folder Upload Support

**File:** `app/api/admin/bulk-import/jobs/[id]/images/route.ts`

```typescript
// Handle folder upload from webkitdirectory input
// Recursively process all files in folder
// Extract PSN from:
// - Filename: "155.jpg", "PSN-155.png", "155-1.jpg"
// - Folder name: "155/photo1.jpg" → PSN: 155

const extractPSN = (filepath: string): string | null => {
  // Try folder name first
  const folderMatch = filepath.match(/^([^/\\]+)[/\\]/);
  if (folderMatch && isValidPSN(folderMatch[1])) {
    return folderMatch[1];
  }

  // Try filename
  const filename = path.basename(filepath, path.extname(filepath));

  // Patterns: "155", "PSN-155", "155-1", "155_1"
  const patterns = [
    /^(\d+)$/,           // 155
    /^PSN-?(\d+)$/i,     // PSN-155, PSN155
    /^(\d+)[-_]\d+$/,    // 155-1, 155_1
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) return match[1];
  }

  return null;
};
```

#### 1.4 Preview Generation

**File:** `app/api/admin/bulk-import/jobs/[id]/preview/route.ts` (NEW)

Returns complete preview:

```typescript
interface ImportPreview {
  properties: Array<{
    row_number: number;
    psn: string;
    property_name: string;
    owner_email: string;
    owner_name: string;
    is_new_owner: boolean;
    images: string[]; // matched image filenames
    warnings: string[];
  }>;

  summary: {
    total_properties: number;
    new_owners: number;
    existing_owners: number;
    total_images: number;
    matched_images: number;
    orphaned_images: number;
    warnings: number;
    errors: number;
  };

  orphaned_images: string[];
}
```

#### 1.5 Atomic Import Execution

**File:** `app/api/admin/bulk-import/jobs/[id]/confirm/route.ts`

```typescript
// Transaction-like process:
// 1. Create all owner accounts (parallel batches)
// 2. Create all properties with owner_id references
// 3. Upload all images to Supabase Storage
// 4. Update property.image arrays
// 5. Send email notifications to new owners
// 6. Generate credentials CSV

// If any step fails, provide partial success info
// Allow retry for failed items
```

### Phase 2: Frontend Implementation

#### 2.1 New Unified Page

**File:** `app/dashboard/admin/bulk-import/page.tsx` (NEW - Replaces separate pages)

```typescript
// Step wizard component
const steps = [
  { id: 'excel', label: 'Upload Excel', icon: FileSpreadsheet },
  { id: 'images', label: 'Upload Images', icon: FolderOpen },
  { id: 'review', label: 'Review & Confirm', icon: Eye },
  { id: 'results', label: 'Results', icon: CheckCircle },
];

// State management with persistence (localStorage)
// In case of refresh, can resume at current step
```

#### 2.2 Step 1: Excel Upload Component

**File:** `components/dashboard/admin/bulk-import/ExcelUploadStep.tsx`

```typescript
// Features:
// - Drag & drop Excel file
// - Real-time validation
// - Column mapping (if columns don't match exactly)
// - Preview table with first 5 rows
// - Show PSN extraction preview
// - Error highlighting

interface ExcelUploadProps {
  jobId: string;
  onComplete: (preview: ExcelPreview) => void;
  onValidationError: (errors: ValidationError[]) => void;
}
```

#### 2.3 Step 2: Image Folder Upload

**File:** `components/dashboard/admin/bulk-import/ImageUploadStep.tsx`

```typescript
// CRITICAL: Support folder upload via webkitdirectory

<input
  type="file"
  webkitdirectory="true"
  directory="true"
  multiple
  onChange={handleFolderSelect}
/>

// Features:
// - Folder selection (not individual files)
// - Recursive file scanning
// - PSN extraction preview
// - Show matched vs unmatched images
// - Image compression progress
// - Upload progress per image

interface ImageUploadProps {
  jobId: string;
  expectedPSNs: string[]; // From Excel step
  onComplete: (matching: ImageMatchingResult) => void;
}
```

#### 2.4 Step 3: Review & Confirm

**File:** `components/dashboard/admin/bulk-import/ReviewStep.tsx`

```typescript
// Comprehensive preview:

// Section 1: Properties Summary
// ┌────────────────────────────────────────────────┐
// │ Total Properties: 50                           │
// │ New Owners: 12      Existing Owners: 38        │
// │ Images Matched: 147   Orphaned: 3              │
// └────────────────────────────────────────────────┘

// Section 2: Properties Table
// | PSN | Property Name | Owner | Images | Status |
// | 155 | Sunrise PG    | John  | 5 ✓    | Ready  |
// | 156 | Moonlight     | Jane  | 0 ⚠    | No Img |

// Section 3: Orphaned Images
// List images that couldn't be matched to any PSN

// Section 4: Confirm Button
// "Import 50 Properties with 147 Images"
```

#### 2.5 Step 4: Results

**File:** `components/dashboard/admin/bulk-import/ResultsStep.tsx`

```typescript
// Show:
// - Success count
// - Failure count with retry option
// - Download credentials button (prominent)
// - View properties link
// - Upload another button

// Credentials download:
// - CSV with: Email, Password, Name, Properties, Login Link
// - Warning: "Download now - passwords cannot be retrieved later"
```

### Phase 3: Database Schema

#### 3.1 Enhanced Bulk Import Jobs Table

```sql
-- Replace bulk_uploads with enhanced table
CREATE TABLE bulk_import_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'created',
    step TEXT DEFAULT 'excel_upload', -- 'excel_upload' | 'image_upload' | 'review' | 'processing' | 'completed'

    -- Excel info
    excel_file_name TEXT,
    total_rows INTEGER DEFAULT 0,
    parsed_properties JSONB DEFAULT '[]'::jsonb,
    validation_errors JSONB DEFAULT '[]'::jsonb,

    -- Image info
    image_count INTEGER DEFAULT 0,
    images_by_psn JSONB DEFAULT '{}'::jsonb,
    orphaned_images JSONB DEFAULT '[]'::jsonb,

    -- Processing results
    new_owners JSONB DEFAULT '[]'::jsonb, -- Includes generated passwords
    created_property_ids UUID[] DEFAULT '{}',
    failed_rows JSONB DEFAULT '[]'::jsonb,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Expiration (cleanup old jobs after 7 days)
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days'
);

-- Indexes
CREATE INDEX idx_bulk_import_jobs_admin ON bulk_import_jobs(admin_id);
CREATE INDEX idx_bulk_import_jobs_status ON bulk_import_jobs(status);
CREATE INDEX idx_bulk_import_jobs_expires ON bulk_import_jobs(expires_at);

-- Cleanup old jobs
CREATE OR REPLACE FUNCTION cleanup_old_bulk_import_jobs()
RETURNS void AS $$
BEGIN
    DELETE FROM bulk_import_jobs
    WHERE expires_at < NOW() AND status IN ('completed', 'failed', 'cancelled');
END;
$$ LANGUAGE plpgsql;
```

### Phase 4: Image Processing Pipeline

#### 4.1 PSN Matching Logic

```typescript
// lib/bulk-import/image-matcher.ts

export class ImageMatcher {
  constructor(private expectedPSNs: string[]) {}

  matchImages(files: File[]): ImageMatchResult {
    const matched: Record<string, File[]> = {};
    const orphaned: File[] = [];

    for (const file of files) {
      const psn = this.extractPSN(file.name, file.webkitRelativePath);

      if (psn && this.expectedPSNs.includes(psn)) {
        if (!matched[psn]) matched[psn] = [];
        matched[psn].push(file);
      } else {
        orphaned.push(file);
      }
    }

    return { matched, orphaned };
  }

  private extractPSN(filename: string, fullPath: string): string | null {
    // Try folder name first (if organized in folders)
    const pathParts = fullPath.split(/[/\\]/);
    if (pathParts.length > 1) {
      const folderName = pathParts[0];
      if (/^\d+$/.test(folderName)) {
        return folderName;
      }
    }

    // Try filename patterns
    const name = filename.replace(/\.[^/.]+$/, ''); // Remove extension

    const patterns = [
      /^(\d+)$/,                    // 155
      /^PSN-?(\d+)$/i,              // PSN-155
      /^(\d+)[-_]\d+$/,             // 155-1, 155_2
      /^(\d+)\s*\(.*\)$/,           // 155 (exterior)
    ];

    for (const pattern of patterns) {
      const match = name.match(pattern);
      if (match) return match[1];
    }

    return null;
  }
}
```

#### 4.2 Image Compression & Upload

```typescript
// lib/bulk-import/image-processor.ts

import imageCompression from 'browser-image-compression';

export class ImageProcessor {
  async processImages(
    files: File[],
    onProgress: (processed: number, total: number) => void
  ): Promise<ProcessedImage[]> {
    const results: ProcessedImage[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      try {
        // Compress
        const compressed = await imageCompression(file, {
          maxSizeMB: 1,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          fileType: 'image/jpeg',
        });

        // Generate unique filename
        const psn = extractPSN(file.name, file.webkitRelativePath);
        const uniqueName = `${psn}/${Date.now()}-${i}.jpg`;

        results.push({
          originalName: file.name,
          file: compressed,
          storagePath: `property-images/${uniqueName}`,
          psn,
          size: compressed.size,
        });

        onProgress(i + 1, files.length);
      } catch (error) {
        results.push({
          originalName: file.name,
          error: error.message,
          psn: extractPSN(file.name, file.webkitRelativePath),
        });
      }
    }

    return results;
  }
}
```

### Phase 5: User Experience Enhancements

#### 5.1 Progress Tracking

```typescript
// Real-time progress for each step
interface ImportProgress {
  step: 'parsing_excel' | 'uploading_images' | 'creating_owners' |
        'creating_properties' | 'assigning_images';
  current: number;
  total: number;
  message: string;
  estimatedTimeRemaining?: number;
}

// Server-Sent Events for real-time updates
// Or polling every 2 seconds
```

#### 5.2 Error Recovery

```typescript
// If import fails mid-way, provide options:

interface FailedImport {
  completedSteps: string[];
  failedStep: string;
  partialResults: {
    ownersCreated: number;
    propertiesCreated: number;
    imagesUploaded: number;
  };
  retryOptions: {
    retryFailedOnly: boolean;
    retryAll: boolean;
    skipImages: boolean;
  };
}
```

#### 5.3 Email Notifications

```typescript
// lib/bulk-import/notifications.ts

export async function notifyNewOwners(owners: OwnerCredential[]) {
  for (const owner of owners) {
    await sendEmail({
      to: owner.email,
      subject: 'Your ZeroRentals Owner Account is Ready',
      template: 'new-owner-welcome',
      data: {
        name: owner.name,
        email: owner.email,
        password: owner.password,
        properties: owner.properties,
        loginUrl: 'https://zerorentals.com/login/owner',
      },
    });
  }
}
```

---

## File Structure

```
app/
├── dashboard/admin/bulk-import/
│   └── page.tsx                    # Main wizard page (REPLACES old pages)
│
├── api/admin/bulk-import/
│   ├── jobs/route.ts               # Create/list jobs
│   └── jobs/[id]/
│       ├── route.ts                # Get job status
│       ├── excel/route.ts          # Upload & parse Excel
│       ├── images/route.ts         # Upload image folder
│       ├── preview/route.ts        # Get preview data
│       ├── confirm/route.ts        # Execute import
│       ├── cancel/route.ts         # Cancel job
│       └── credentials/route.ts    # Download CSV
│
components/dashboard/admin/bulk-import/
├── BulkImportWizard.tsx            # Main wizard container
├── ExcelUploadStep.tsx             # Step 1: Excel upload
├── ImageUploadStep.tsx             # Step 2: Image folder upload
├── ReviewStep.tsx                  # Step 3: Review & confirm
├── ResultsStep.tsx                 # Step 4: Results display
├── PropertyPreviewTable.tsx        # Reusable preview table
├── ImageMatchingStatus.tsx         # Show matched/unmatched
├── CredentialsDownload.tsx         # Download credentials
└── ProgressIndicator.tsx           # Step progress UI

lib/bulk-import/
├── types.ts                        # TypeScript types
├── excel-parser.ts                 # Excel parsing logic
├── image-matcher.ts                # PSN matching logic
├── image-processor.ts              # Compression & upload
├── validator.ts                    # Data validation
├── job-manager.ts                  # Job state management
└── notifications.ts                # Email notifications
```

---

## API Deprecation Plan

### Phase 1 (Immediate):
- Keep existing endpoints for backward compatibility
- Add deprecation headers

### Phase 2 (After 30 days):
- Redirect old endpoints to new unified flow
- Show migration message

### Phase 3 (After 60 days):
- Remove old endpoints

---

## Testing Strategy

### Unit Tests:
- Excel parser with various formats
- PSN extraction from filenames
- Image compression
- Validation logic

### Integration Tests:
- Complete import flow
- Error recovery
- Concurrent uploads

### E2E Tests:
- Admin uploads Excel + folder
- Verify properties created
- Verify images assigned
- Verify owner login works

---

## Security Considerations

1. **File Upload Security:**
   - Validate Excel file type (not just extension)
   - Scan images for malware
   - Limit file sizes (Excel: 10MB, Images: 5MB each)
   - Rate limiting: 5 imports per hour per admin

2. **Data Protection:**
   - Encrypt credentials in database
   - Auto-delete jobs after 7 days
   - Log all import actions

3. **Access Control:**
   - Admin-only access to all endpoints
   - Verify admin role on every request

---

## Rollback Plan

If issues arise:

1. **Database:** Keep old tables, create new ones with `_v2` suffix
2. **APIs:** Keep old endpoints, add new ones under `/v2/` prefix
3. **UI:** Feature flag for new wizard

---

## Success Metrics

- [ ] Admin can complete import in < 5 minutes
- [ ] 99% PSN matching accuracy
- [ ] < 1% image upload failures
- [ ] Zero data loss during import
- [ ] Owner credentials work immediately
- [ ] Properties visible in search within 30 seconds

---

## Implementation Phases

### Week 1: Foundation
- [ ] Database schema changes
- [ ] API endpoint structure
- [ ] Type definitions

### Week 2: Backend Core
- [ ] Excel upload & validation
- [ ] Image folder upload
- [ ] PSN matching logic
- [ ] Preview generation

### Week 3: Frontend
- [ ] Wizard UI components
- [ ] Step 1 & 2 implementation
- [ ] Step 3 & 4 implementation

### Week 4: Integration & Testing
- [ ] End-to-end flow
- [ ] Error handling
- [ ] Performance optimization
- [ ] E2E tests

### Week 5: Migration
- [ ] Deprecate old endpoints
- [ ] Update navigation
- [ ] Documentation
- [ ] Admin training guide

---

**Plan saved to:** `.claude/plan/unified-bulk-import-with-images.md`

**Next step:** Execute with `/ccg:execute .claude/plan/unified-bulk-import-with-images.md`
