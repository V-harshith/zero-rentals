# Admin Property Management E2E Test Report

## Test Suite Overview

This document describes the comprehensive E2E test suite for admin property management operations in ZeroRentals.

## Test Coverage

### 1. Property Approval/Rejection Tests (`admin/property-approval.spec.ts`)

| Test Case | Description | Status |
|-----------|-------------|--------|
| Approve pending property | Verifies single property approval flow | Ready |
| Reject pending property | Verifies single property rejection flow | Ready |
| CSRF token handling | Ensures no "Invalid CSRF token" errors occur | Ready |
| transition_property_status function | Verifies database function works correctly | Ready |
| Loading state verification | Confirms UI shows loading during operations | Ready |
| Rapid click handling | Tests graceful handling of rapid approve/reject clicks | Ready |

**Key Assertions:**
- Property is removed from pending list after approval
- Success toast message appears
- No CSRF errors in console or network
- API returns proper status codes

### 2. Multi-Select Operations Tests (`admin/multi-select.spec.ts`)

| Test Case | Description | Status |
|-----------|-------------|--------|
| Select multiple properties | Individual checkbox selection | Ready |
| Select all properties | "Select All" checkbox functionality | Ready |
| Deselect all properties | Unchecking "Select All" | Ready |
| Clear selection button | Using Clear button to reset selection | Ready |
| Bulk approve button count | Verifies button shows correct count | Ready |
| Bulk reject button count | Verifies button shows correct count | Ready |
| Bulk approve action | Approving multiple properties at once | Ready |
| Bulk reject action | Rejecting multiple properties at once | Ready |
| Checkbox sync on update | Selection clears when properties update | Ready |

**Key Assertions:**
- Bulk actions bar appears when properties selected
- Correct count displayed on action buttons
- Confirmation dialogs appear for bulk actions
- Selection clears after successful operations

### 3. Property Filtering Tests (`admin/property-filtering.spec.ts`)

| Test Case | Description | Status |
|-----------|-------------|--------|
| Co-living properties | Verify Co-living filter shows only Co-living | Ready |
| Male PG filter | Verify Male filter shows Male properties | Ready |
| Female PG filter | Verify Female filter shows Female properties | Ready |
| No cross-contamination | Verify filters are independent | Ready |
| Property type persistence | Changes persist after refresh | Ready |
| Location search | Search by location from admin dashboard | Ready |
| Public PG filter | Homepage PG type filter | Ready |
| Public Co-living filter | Homepage Co-living type filter | Ready |

**Key Assertions:**
- Only properties matching filter criteria are displayed
- Property type changes persist after page refresh
- No property appears in multiple incompatible filters

### 4. Property Locks Tests (`admin/property-locks.spec.ts`)

| Test Case | Description | Status |
|-----------|-------------|--------|
| Lock acquisition | Verify lock is acquired during approval | Ready |
| Concurrent edit prevention | 423 Locked status for concurrent edits | Ready |
| Rapid approval handling | Graceful handling of rapid clicks | Ready |
| Lock release | Lock released after operation completes | Ready |
| Lock error handling | Appropriate errors when locked by another | Ready |
| API unauthorized access | 401 for unauthorized lock attempts | Ready |
| API CSRF protection | CSRF validation on lock endpoints | Ready |

**Key Assertions:**
- API returns 401 for unauthorized requests
- API returns 423 for locked resources
- No console errors during lock operations
- Locks are released after operations complete

## Running the Tests

### Prerequisites
1. Install dependencies:
   ```bash
   npm install
   npx playwright install chromium
   ```

2. Set environment variables (optional):
   ```bash
   export ADMIN_EMAIL=admin@zerorentals.com
   export ADMIN_PASSWORD=your-password
   export BASE_URL=http://localhost:3000  # or your staging URL
   ```

3. Start the application (if testing locally):
   ```bash
   npm run dev
   ```

### Run Commands

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npx playwright test tests/e2e/admin/property-approval.spec.ts

# Run with UI mode for debugging
npm run test:e2e:ui

# Run in headed mode (see browser)
npm run test:e2e:headed

# Debug tests
npm run test:e2e:debug

# Show HTML report
npm run test:e2e:report
```

## Expected Test Results

### Success Criteria

1. **Property Approval/Rejection**
   - All approval/rejection operations complete successfully
   - No CSRF token errors occur
   - Properties transition from pending to active/rejected status
   - UI updates optimistically and refreshes correctly

2. **Multi-Select Operations**
   - Checkboxes sync correctly across all states
   - Bulk actions work for any number of selected properties
   - Select all/none functionality works as expected
   - Confirmation dialogs prevent accidental actions

3. **Property Filtering**
   - Co-living properties only appear in Co-living section
   - Male PG shows only Male properties
   - Female PG shows only Female properties
   - No cross-contamination between gender filters
   - Property type changes persist after refresh

4. **Property Locks**
   - Locks are acquired before operations
   - Concurrent edits are prevented with proper error messages
   - Locks are released after operations complete
   - API returns appropriate status codes (401, 403, 423)

## Artifacts

After test execution, the following artifacts are generated:

- **Screenshots**: `test-results/*.png` - Visual verification of test states
- **HTML Report**: `playwright-report/index.html` - Detailed test results
- **JUnit XML**: `playwright-results.xml` - CI integration format
- **Traces**: Available in HTML report for failed tests
- **Videos**: Recorded for failed tests (when configured)

## Known Limitations

1. Tests require valid admin credentials
2. Tests assume the presence of pending properties for approval/rejection tests
3. Some tests may be skipped if no data is available
4. Local testing requires proper environment variables setup

## Troubleshooting

### Common Issues

1. **CSRF Token Errors**
   - Verify `/api/csrf` endpoint is accessible
   - Check CSRF cookie is being set correctly
   - Ensure `x-csrf-token` header is being sent

2. **Authentication Failures**
   - Check admin credentials in environment variables
   - Verify login page URL is `/login/admin`
   - Ensure admin dashboard loads at `/dashboard/admin`

3. **Missing Pending Properties**
   - Some tests skip if no pending properties exist
   - Create test properties or seed database with pending properties

## CI/CD Integration

For continuous integration, add these environment variables:

```bash
CI=true
BASE_URL=https://staging.zerorentals.com
ADMIN_EMAIL=test-admin@zerorentals.com
ADMIN_PASSWORD=secure-test-password
```

The tests will:
- Run with retries (2 in CI)
- Generate JUnit XML for reporting
- Capture screenshots/videos on failure
- Use single worker for data consistency

## Maintenance Notes

- Update selectors if UI changes
- Adjust timeouts based on network conditions
- Add new tests for new features
- Review and update skipped tests regularly
