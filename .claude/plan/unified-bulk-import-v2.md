# Unified Bulk Import System - FINAL Implementation Plan

## Based on Actual File Structure Analysis

---

## File Structure Analysis

### Excel File: `ZeroRentals_Harshith_Import_Template.xlsx`

**Columns (from current implementation):**

| Column | Purpose | Required |
|--------|---------|----------|
| `PSN` | Property Serial Number - links to image folder | Yes |
| `Property Name` | Property title | Yes |
| `PG's For` / `PG's For` | Property type + tenant gender | Yes |
| `City` | City name | Yes |
| `Area` | Area name | Yes |
| `Locality` | Locality | No |
| `Address` | Full address | No |
| `Owner Name` | Owner's name | Yes |
| `Owner Contact` | Owner's phone | Yes |
| `Email` | Owner's email - used to create account | Yes |
| `Private Room` | Price for single room | No |
| `Double Sharing` | Price for double sharing | No |
| `Triple Sharing` | Price for triple sharing | No |
| `Four Sharing` | Price for four sharing | No |
| `Deposit` | Security deposit amount | No |
| `Facilities` | Comma-separated amenities | No |
| `USP` | Unique selling point | No |
| `Landmark` | Nearby landmark | No |

### Image Folder Structure

```
Harshth Prop Pics-20260119T173512Z-1-001/    ← Admin selects this folder
└── Harshth Prop Pics/                        ← Root folder
    ├── 1053/                                 ← PSN = folder name
    │   ├── WhatsApp Image 2022-07-08 at 3.09.42 PM.jpeg
    │   ├── IMG_20220115_143022.jpg
    │   └── exterior.jpg
    ├── 1054/                                 ← PSN = 1054
    │   ├── photo1.jpg
    │   └── photo2.jpg
    └── 1055/                                 ← PSN = 1055
        └── ...
```

**Key Insight:** PSN is extracted from **folder names**, not filenames!

---

## Unified Import Flow

### Step 1: Upload Excel
```
┌────────────────────────────────────────────────────────────────┐
│  📄 Upload Excel File                                           │
│                                                                 │
│  [Drag & Drop or Click to Select]                              │
│                                                                 │
│  Expected columns: PSN, Property Name, Email, Owner Name, etc  │
│                                                                 │
│  Preview (first 5 rows):                                       │
│  ┌──────┬───────────────┬─────────────────┬──────────────────┐ │
│  │ PSN  │ Property Name │ Owner Email     │ Status           │ │
│  ├──────┼───────────────┼─────────────────┼──────────────────┤ │
│  │ 1053 │ Sunrise PG    │ john@gmail.com  │ New Owner ✓      │ │
│  │ 1054 │ Moonlight     │ jane@gmail.com  │ Existing ✓       │ │
│  │ 1055 │ Star Living   │ bob@gmail.com   │ New Owner ✓      │ │
│  └──────┴───────────────┴─────────────────┴──────────────────┘ │
│                                                                 │
│  Summary: 50 properties, 12 new owners, 38 existing            │
│                                                                 │
│              [Continue to Images →]                            │
└────────────────────────────────────────────────────────────────┘
```

### Step 2: Upload Image Folder
```
┌────────────────────────────────────────────────────────────────┐
│  📁 Upload Image Folder                                         │
│                                                                 │
│  [Select Folder]  ← Uses webkitdirectory for folder selection  │
│                                                                 │
│  Folder structure detected:                                    │
│  Harshth Prop Pics/                                            │
│  ├── 1053/ (3 images) ✓ MATCHED                                │
│  ├── 1054/ (2 images) ✓ MATCHED                                │
│  ├── 1055/ (4 images) ✓ MATCHED                                │
│  ├── 9999/ (2 images) ✗ NO PROPERTY (will be ignored)          │
│  └── 1060/ (0 images) ⚠ EMPTY FOLDER                           │
│                                                                 │
│  Matching: 47/50 properties have images                        │
│  Unmatched properties: 1056, 1057, 1058                        │
│                                                                 │
│  [Compressing & Uploading... 45/50 images done]                │
│                                                                 │
│              [Continue to Review →]                            │
└────────────────────────────────────────────────────────────────┘
```

### Step 3: Review & Confirm
```
┌────────────────────────────────────────────────────────────────┐
│  👁 Review Before Import                                        │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ SUMMARY                                                    │ │
│  │ • 50 Properties to create                                  │ │
│  │ • 12 New owner accounts (credentials will be generated)   │ │
│  │ • 47 Properties with images (152 total images)            │ │
│  │ • 3 Properties without images                             │ │
│  │ • 1 Orphaned folder (9999 - no matching property)         │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  PROPERTIES PREVIEW:                                           │
│  ┌──────┬───────────────┬───────────────┬──────────┬─────────┐ │
│  │ PSN  │ Property      │ Owner         │ Images   │ Status  │ │
│  ├──────┼───────────────┼───────────────┼──────────┼─────────┤ │
│  │ 1053 │ Sunrise PG    │ john@...      │ 3 ✓      │ Ready   │ │
│  │ 1054 │ Moonlight     │ jane@... (E)  │ 2 ✓      │ Ready   │ │
│  │ 1055 │ Star Living   │ bob@...       │ 4 ✓      │ Ready   │ │
│  │ 1056 │ Galaxy PG     │ alice@...     │ 0 ⚠      │ No Img  │ │
│  │ ...  │ ...           │ ...           │ ...      │ ...     │ │
│  └──────┴───────────────┴───────────────┴──────────┴─────────┘ │
│                                                                 │
│  ⚠ Warnings:                                                   │
│  • 3 properties will be created without images                 │
│  • You can add images later via bulk image upload              │
│                                                                 │
│  [✓] Send welcome emails to new owners                         │
│                                                                 │
│              [✓ Confirm Import]                                │
└────────────────────────────────────────────────────────────────┘
```

### Step 4: Processing & Results
```
┌────────────────────────────────────────────────────────────────┐
│  🔄 Importing...                                                │
│                                                                 │
│  [████████████████████████████████░░░░░░] 85%                 │
│                                                                 │
│  Creating owner accounts: 12/12 ✓                              │
│  Creating properties: 50/50 ✓                                  │
│  Uploading images: 152/152 ✓                                   │
│  Assigning images to properties: 47/47 ✓                       │
│  Sending emails: 12/12 ✓                                       │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

```
┌────────────────────────────────────────────────────────────────┐
│  ✅ Import Complete!                                            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ RESULTS                                                    │ │
│  │ • 50 Properties created successfully                       │ │
│  │ • 12 New owner accounts created                            │ │
│  │ • 152 Images uploaded and assigned                         │ │
│  │ • 12 Welcome emails sent                                   │ │
│  │ • 0 Errors                                                 │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  🎉 NEW OWNER CREDENTIALS - DOWNLOAD NOW!                      │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ ⚠ IMPORTANT: Download credentials now. Passwords are     │ │
│  │    encrypted and cannot be retrieved after you leave      │ │
│  │    this page.                                             │ │
│  │                                                           │ │
│  │    [📥 Download credentials.csv]                          │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Preview of credentials:                                       │
│  ┌─────────────────────┬─────────────────┬───────────────────┐ │
│  │ Email               │ Password        │ Properties        │ │
│  ├─────────────────────┼─────────────────┼───────────────────┤ │
│  │ john@gmail.com      │ xK9#mP2$vLqR    │ Sunrise PG        │ │
│  │ bob@gmail.com       │ nB5@wE8!zYtH    │ Star Living       │ │
│  │ ...                 │ ...             │ ...               │ │
│  └─────────────────────┴─────────────────┴───────────────────┘ │
│                                                                 │
│  [View All Properties]  [Import More]  [Back to Dashboard]     │
└────────────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### 1. Folder Upload Support (Critical)

**File:** `components/dashboard/admin/bulk-import/ImageUploadStep.tsx`

```typescript
// The key is using webkitdirectory attribute
<input
  type="file"
  webkitdirectory="true"      // Enables folder selection
  directory="true"             // Firefox fallback
  multiple                     // Allow multiple files
  onChange={handleFolderSelect}
  className="hidden"
  id="folder-upload"
/>

// Extract PSN from folder structure
const extractPSNFromPath = (filepath: string): string | null => {
  // filepath format: "Harshth Prop Pics/1053/image.jpg"
  const parts = filepath.split(/[/\\]/);

  // First folder after root should be PSN
  if (parts.length >= 2) {
    const folderName = parts[1]; // "1053"

    // Validate: PSN should be numeric
    if (/^\d+$/.test(folderName)) {
      return folderName;
    }
  }

  return null;
};

// Process folder upload
const processFolder = (files: File[]) => {
  const imagesByPSN: Record<string, File[]> = {};
  const orphaned: File[] = [];

  for (const file of files) {
    // file.webkitRelativePath gives us the full path
    const path = file.webkitRelativePath || file.name;
    const psn = extractPSNFromPath(path);

    if (psn && expectedPSNs.includes(psn)) {
      if (!imagesByPSN[psn]) imagesByPSN[psn] = [];
      imagesByPSN[psn].push(file);
    } else {
      orphaned.push(file);
    }
  }

  return { imagesByPSN, orphaned };
};
```

### 2. API Endpoints

```typescript
// app/api/admin/bulk-import/jobs/route.ts

// POST - Create new import job
// Request: {}
// Response: { jobId: string, status: 'created' }

// GET - List admin's recent jobs
// Response: { jobs: ImportJob[] }

// --------------------------------------------------------
// app/api/admin/bulk-import/jobs/[id]/excel/route.ts

// POST - Upload and parse Excel
// Request: FormData { file: File }
// Response: {
//   status: 'parsed',
//   totalRows: number,
//   properties: ParsedProperty[],
//   newOwners: number,
//   existingOwners: number,
//   psnList: string[]
// }

// --------------------------------------------------------
// app/api/admin/bulk-import/jobs/[id]/images/route.ts

// POST - Upload image folder
// Request: FormData { images: File[] }
// Process:
//   1. Extract PSN from each file's webkitRelativePath
//   2. Match to expected PSNs from Excel
//   3. Compress images
//   4. Upload to Supabase Storage
//   5. Store staging info in database
// Response (streaming): {
//   progress: number,
//   processed: number,
//   total: number,
//   matchedImages: number,
//   orphanedImages: number
// }

// --------------------------------------------------------
// app/api/admin/bulk-import/jobs/[id]/confirm/route.ts

// POST - Execute final import
// Process:
//   1. Create owner accounts (parallel batches of 5)
//   2. Create properties with owner_id
//   3. Update property images array
//   4. Send welcome emails
// Response (streaming): {
//   step: string,
//   progress: number,
//   ownersCreated: number,
//   propertiesCreated: number,
//   imagesAssigned: number
// }

// --------------------------------------------------------
// app/api/admin/bulk-import/jobs/[id]/credentials/route.ts

// GET - Download credentials CSV
// Response: CSV file
// Email,Password,Name,Phone,Properties,LoginUrl
```

### 3. Database Schema

```sql
-- Main job tracking table
CREATE TABLE bulk_import_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Current status
    status TEXT NOT NULL DEFAULT 'created',
    -- 'created' -> 'parsing_excel' -> 'excel_parsed' ->
    -- 'uploading_images' -> 'images_uploaded' ->
    -- 'ready' -> 'processing' -> 'completed' | 'failed'

    -- Excel data
    excel_file_name TEXT,
    total_properties INTEGER DEFAULT 0,
    parsed_properties JSONB DEFAULT '[]'::jsonb,
    -- Each property: { psn, name, city, area, ownerEmail, ownerName, ... }

    -- Image data
    total_images INTEGER DEFAULT 0,
    images_by_psn JSONB DEFAULT '{}'::jsonb,
    -- { "1053": ["path/to/img1.jpg", "path/to/img2.jpg"], ... }

    orphaned_images JSONB DEFAULT '[]'::jsonb,
    -- Images that didn't match any PSN

    -- Processing results
    created_owner_ids UUID[] DEFAULT '{}',
    created_property_ids UUID[] DEFAULT '{}',
    failed_items JSONB DEFAULT '[]'::jsonb,

    -- Credentials (encrypted)
    credentials_encrypted TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Auto-cleanup after 7 days
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days'
);

-- Index for fast lookups
CREATE INDEX idx_bulk_import_jobs_admin ON bulk_import_jobs(admin_id);
CREATE INDEX idx_bulk_import_jobs_status ON bulk_import_jobs(status);
```

### 4. Processing Order

```typescript
// Order of operations for atomicity

const executeImport = async (jobId: string) => {
  const job = await getJob(jobId);

  // Step 1: Create owners (can be parallel)
  const ownerResults = await Promise.allSettled(
    chunk(job.newOwners, 5).map(batch =>
      Promise.all(batch.map(owner => createOwner(owner)))
    )
  );

  // Step 2: Create properties with owner references
  const propertyResults = await Promise.allSettled(
    chunk(job.properties, 10).map(batch =>
      createProperties(batch) // batch insert
    )
  );

  // Step 3: Update property images
  for (const [psn, imageUrls] of Object.entries(job.imagesByPSN)) {
    await updatePropertyImages(psn, imageUrls);
  }

  // Step 4: Send emails (throttled)
  for (const owner of job.newOwners) {
    await sendWelcomeEmail(owner);
    await sleep(100); // Rate limit
  }

  // Step 5: Mark complete
  await completeJob(jobId);
};
```

---

## Edge Cases & Solutions

| Edge Case | Solution |
|-----------|----------|
| **Duplicate PSN in Excel** | Show error, require unique PSNs |
| **Folder exists but no images** | Warning: "PSN 1056 folder is empty" |
| **Image exists but no PSN folder** | Orphaned list, can be assigned later |
| **Owner email already exists** | Link to existing owner, don't create new account |
| **Invalid email format** | Validation error before import |
| **Excel has PSN, no folder** | Property created without images (can add later) |
| **Import fails mid-way** | Track progress, allow resume from failed step |
| **Browser doesn't support folder upload** | Fallback: zip file upload + extraction |
| **Images > 5MB each** | Compress to 1MB max, warn if still too large |
| **500+ images** | Batch processing, show progress per batch |

---

## Component Structure

```
app/dashboard/admin/bulk-import/
└── page.tsx                          # Main wizard page

components/dashboard/admin/bulk-import/
├── BulkImportWizard.tsx              # Wizard state management
├── StepIndicator.tsx                 # 1-2-3-4 progress bar
│
├── steps/
│   ├── ExcelUploadStep.tsx           # Step 1: Excel upload
│   ├── ImageUploadStep.tsx           # Step 2: Folder upload
│   ├── ReviewStep.tsx                # Step 3: Review & confirm
│   └── ResultsStep.tsx               # Step 4: Results & download
│
├── shared/
│   ├── PropertyTable.tsx             # Reusable property list
│   ├── ImageMatchingStatus.tsx       # Matched/orphaned display
│   ├── CredentialsDownload.tsx       # Download with warning
│   └── ProgressBar.tsx               # Upload progress
│
└── hooks/
    ├── useImportJob.ts               # Job state management
    ├── useExcelParser.ts             # Excel parsing
    └── useImageUpload.ts             # Folder upload handler

lib/bulk-import/
├── excel-parser.ts                   # XLSX parsing
├── image-matcher.ts                  # PSN matching from paths
├── image-processor.ts                # Compression
├── job-manager.ts                    # API calls
├── credentials-crypto.ts             # Encrypt/decrypt passwords
└── notifications.ts                  # Email sending
```

---

## Migration from Current System

### What to Keep:
- ✅ Excel parsing logic (works well)
- ✅ Owner account creation
- ✅ Password generation
- ✅ Database schema (properties, users)

### What to Replace:
- ❌ `/admin/bulk-upload` page → New unified wizard
- ❌ `/admin/bulk-image-upload` page → Integrated into wizard
- ❌ Separate API endpoints → Unified `/api/admin/bulk-import/*`
- ❌ `bulk_uploads` table → Enhanced `bulk_import_jobs` table

### Migration Steps:
1. Create new tables alongside old ones
2. Build new UI components
3. Test with sample data
4. Update navigation links
5. Add redirects from old pages
6. Remove old code after 30 days

---

## Testing Checklist

- [ ] Excel with 50+ rows parses correctly
- [ ] Folder with 100+ images uploads successfully
- [ ] PSN matching works with nested folders
- [ ] New owner accounts created with correct details
- [ ] Credentials CSV downloads correctly
- [ ] Properties visible in search immediately after import
- [ ] Images display correctly on property cards
- [ ] Owners can log in with generated credentials
- [ ] Partial failures handled gracefully
- [ ] Works on Chrome, Firefox, Safari, Edge

---

**Final Plan saved to:** `.claude/plan/unified-bulk-import-v2.md`

**Ready to execute with:** `/ccg:execute .claude/plan/unified-bulk-import-v2.md`
