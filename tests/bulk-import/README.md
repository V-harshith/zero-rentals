# Bulk Import Test Suite

Comprehensive test coverage for the unified bulk import system.

## Test Coverage

### 1. PSN Extraction Tests (`psn-extraction.test.ts`)
Tests the logic for extracting Property Serial Numbers (PSN) from file paths.

**Coverage:**
- Folder name extraction (primary method)
- Filename pattern extraction (fallback)
- Windows and Unix-style paths
- Edge cases (empty paths, invalid formats)
- Real-world folder structures

**Key Test Cases:**
```typescript
// Folder extraction
'Harshith Prop Pics/1053/image1.jpg' → '1053'
'bulk/2024/properties/1053/photo.jpg' → '1053'

// Filename patterns
'1053.jpg' → '1053'
'PSN-1053.jpg' → '1053'
'1053-1.jpg' → '1053'
```

### 2. Excel Parsing Tests (`excel-parsing.test.ts`)
Tests the Excel data parsing and validation logic.

**Coverage:**
- Amenities mapping (synonym recognition)
- Property type detection (PG, Co-living, Rent)
- Preferred tenant detection (Male, Female, Any)
- Price parsing and validation
- Room type determination
- Email validation (rejects phone number emails)

**Key Test Cases:**
```typescript
// Amenities mapping
'wifi, ac, tv' → ['WiFi', 'AC', 'TV']
'internet, air conditioning' → ['WiFi', 'AC']

// Property type
'PG for Gents' → 'PG'
'Co-living Space' → 'Co-living'
'Apartment for Rent' → 'Rent'

// Email validation
'owner@example.com' → valid
'9876543210@gmail.com' → invalid (phone number)
```

### 3. API Tests (`api.test.ts`)
Tests the API routes for bulk import.

**Coverage:**
- Excel upload endpoint (`POST /excel`)
- Image upload endpoint (`POST /images`)
- Confirm import endpoint (`POST /confirm`)
- Streaming response handling
- Error handling and validation

**Key Test Cases:**
- Authorization checks
- File type validation
- File size limits
- PSN categorization
- Orphaned image detection
- Owner account creation
- Property creation with image assignment

### 4. Component Tests (`components.test.tsx`)
Tests the React components for the bulk import wizard.

**Coverage:**
- ExcelUploadStep
- ImageUploadStep
- ReviewStep
- ResultsStep

**Key Test Cases:**
- File upload interactions
- PSN detection preview
- Summary card rendering
- Progress indicators
- Error displays
- Success/failure states

### 5. Integration Tests (`integration.test.ts`)
Tests the complete end-to-end workflow.

**Coverage:**
- Full import workflow
- Orphaned image handling
- Duplicate PSN detection
- Partial failure handling
- Network error recovery
- Storage upload failures

## Running Tests

### Install Dependencies
```bash
npm install
```

### Run All Tests
```bash
npm run test:unit
```

### Run Bulk Import Tests Only
```bash
npx vitest run tests/bulk-import --reporter=verbose
```

### Run Specific Test File
```bash
npx vitest run tests/bulk-import/psn-extraction.test.ts
```

### Run with Watch Mode
```bash
npx vitest --watch
```

### Run with Coverage
```bash
npx vitest run --coverage
```

## Test Results

**Current Status: 63 tests passing**

```
✓ psn-extraction.test.ts (14 tests)
  - Folder name extraction
  - Filename pattern extraction
  - Windows/Unix path handling
  - Edge cases

✓ excel-parsing.test.ts (24 tests)
  - Amenities mapping
  - Property type detection
  - Tenant detection
  - Price parsing
  - Room type detection
  - Email validation

✓ api.test.ts (14 tests)
  - Excel upload endpoint
  - Image upload endpoint
  - Confirm import endpoint
  - Streaming responses

✓ integration.test.ts (11 tests)
  - Full import workflow
  - Orphaned image handling
  - Duplicate PSN detection
  - Error handling
```

## Test Configuration

The test suite uses:
- **Vitest**: Test runner
- **@testing-library/react**: Component testing
- **@testing-library/jest-dom**: DOM assertions
- **jsdom**: Browser environment simulation

Configuration files:
- `vitest.config.ts`: Main configuration
- `vitest.setup.ts`: Test setup and mocks

## Mocked Dependencies

The following are mocked during tests:
- Supabase client (`@/lib/supabase`, `@/lib/supabase-server`, `@/lib/supabase-admin`)
- Next.js navigation (`next/navigation`)
- Next.js headers (`next/headers`)
- Sonner toast notifications (`sonner`)
- Browser image compression (`browser-image-compression`)
- File API (FileReader, URL.createObjectURL)

## Adding New Tests

### Unit Test Pattern
```typescript
import { describe, it, expect } from 'vitest'

describe('Feature Name', () => {
  it('should do something specific', () => {
    const result = functionUnderTest(input)
    expect(result).toBe(expectedOutput)
  })
})
```

### Component Test Pattern
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

describe('ComponentName', () => {
  it('renders correctly', () => {
    render(<ComponentName prop="value" />)
    expect(screen.getByText('Expected Text')).toBeInTheDocument()
  })
})
```

## Continuous Integration

To add tests to CI/CD pipeline:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:unit
```

## Troubleshooting

### "Cannot find module" errors
Make sure all dependencies are installed:
```bash
npm install
```

### "window is not defined" errors
Tests use jsdom environment by default. Check `vitest.config.ts`:
```typescript
test: {
  environment: 'jsdom',
}
```

### Mock not working
Ensure mocks are defined in `vitest.setup.ts` and the module path matches exactly.

## Test Maintenance

When modifying bulk import functionality:
1. Update affected test files
2. Ensure edge cases are covered
3. Run full test suite before committing
4. Maintain 80%+ code coverage
