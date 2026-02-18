# E2E Test Suite for ZeroRentals Admin Property Management

This directory contains comprehensive end-to-end tests for the admin property management functionality using Playwright.

## Test Coverage

### 1. Property Approval/Rejection (`admin/property-approval.spec.ts`)
- Test approve pending property
- Test reject pending property
- Test CSRF token handling (no "Invalid CSRF token" errors)
- Verify transition_property_status function works
- Edge cases: loading states, rapid clicks

### 2. Multi-Select Operations (`admin/multi-select.spec.ts`)
- Test selecting multiple properties in Pending tab
- Test bulk approve/reject
- Test select all/none
- Verify checkboxes sync correctly
- Bulk action confirmation dialogs

### 3. Property Filtering (`admin/property-filtering.spec.ts`)
- Test Co-living properties appear only in Co-living section
- Test Male PG shows only Male properties
- Test Female PG shows only Female properties
- Verify no cross-contamination
- Property type persistence after refresh

### 4. Property Locks (`admin/property-locks.spec.ts`)
- Test property lock acquisition
- Test concurrent edit prevention
- Lock timeout and release functionality
- API-level lock verification

### 5. Bulk Import (`bulk-import/`)
- **Excel Upload** (`excel-upload.spec.ts`): Valid/invalid Excel, property types, validation
- **Image Upload** (`image-upload.spec.ts`): PSN matching, orphaned images, compression
- **Review Step** (`review-step.spec.ts`): Property preview, image counts, owner info
- **Confirm Import** (`confirm-import.spec.ts`): Property creation, credentials, database records
- **Full Flow** (`full-flow.spec.ts`): End-to-end workflows
- **Error Handling** (`error-handling.spec.ts`): Server errors, network issues, recovery

## Setup

1. Install dependencies:
```bash
npm install
npx playwright install chromium
```

2. Set up environment variables (optional):
```bash
export ADMIN_EMAIL=admin@zerorentals.com
export ADMIN_PASSWORD=your-password
export BASE_URL=http://localhost:3000
```

## Running Tests

### Run all E2E tests:
```bash
npx playwright test
```

### Run specific test file:
```bash
npx playwright test tests/e2e/admin/property-approval.spec.ts
```

### Run bulk import tests only:
```bash
npx playwright test tests/e2e/bulk-import/
```

### Run specific bulk import test:
```bash
npx playwright test tests/e2e/bulk-import/excel-upload.spec.ts
```

### Run tests in headed mode (see browser):
```bash
npx playwright test --headed
```

### Run tests with UI mode:
```bash
npx playwright test --ui
```

### Debug tests:
```bash
npx playwright test --debug
```

## Test Artifacts

After test runs, the following artifacts are generated:
- **Screenshots**: `test-results/*.png` - Captured during test execution
- **HTML Report**: `playwright-report/index.html` - Detailed test report
- **JUnit XML**: `playwright-results.xml` - CI-friendly test results
- **Traces**: Available in HTML report for failed tests
- **Videos**: Recorded for failed tests when configured

## Configuration

The Playwright configuration is in `playwright.config.ts`:
- Tests run against `http://localhost:3000` by default
- Chromium browser is used
- Screenshots captured on failure
- Videos retained on failure
- Traces collected on first retry

## Writing New Tests

### Test Structure:
```typescript
import { test, expect, Page } from '@playwright/test'

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Login and setup
  })

  test('should do something', async ({ page }) => {
    // Test steps
  })
})
```

### Best Practices:
1. Use `data-testid` attributes for reliable element selection
2. Add appropriate timeouts for network operations
3. Take screenshots at key verification points
4. Handle conditional UI states (empty states, loading states)
5. Clean up after tests when modifying data

## Troubleshooting

### Tests fail due to missing CSRF token:
- Ensure the app is running and accessible
- Check that `/api/csrf` endpoint returns a valid token
- Verify CSRF cookie is being set correctly

### Tests fail due to authentication:
- Verify admin credentials in environment variables
- Check that the login page is at `/login/admin`
- Ensure the admin dashboard loads at `/dashboard/admin`

### Tests are flaky:
- Increase timeouts in `playwright.config.ts`
- Add explicit waits for dynamic content
- Use `expect().toBeVisible()` instead of fixed delays

## CI/CD Integration

For CI environments, set these environment variables:
```bash
CI=true
BASE_URL=https://your-staging-url.com
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=secure-password
```

The tests will automatically:
- Use appropriate timeouts for CI
- Generate JUnit XML for test reporting
- Capture artifacts on failure
- Retry failed tests (2 retries in CI)
