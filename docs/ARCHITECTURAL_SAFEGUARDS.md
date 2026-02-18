# Architectural Safeguards

This document describes the comprehensive architectural safeguards implemented to ensure data integrity, type safety, and robust error handling throughout the ZeroRentals application.

## Overview

The safeguards are organized into five key areas:

1. **Zod Validation** - Strict runtime schema validation
2. **Database Triggers** - Data integrity at the database level
3. **Runtime Assertions** - Defensive programming assertions
4. **TypeScript Branded Types** - Type-safe domain primitives
5. **Error Logging** - Comprehensive error tracking and logging

---

## 1. Zod Validation (`lib/validations/strict-schemas.ts`)

### Purpose
Provides strict, comprehensive Zod schemas for all domain entities with business rule validation.

### Key Features
- **Strict object parsing** - No unknown keys allowed
- **Business rule validation** - Cross-field validation (e.g., floor_number <= total_floors)
- **Custom error messages** - User-friendly validation errors
- **Transform pipelines** - Automatic data normalization

### Usage Examples

```typescript
import { StrictPropertySchema, PropertyCreateSchema } from '@/lib/validations'

// Validate incoming API data
const result = StrictPropertySchema.safeParse(untrustedData)
if (!result.success) {
  // Handle validation errors with detailed messages
  console.error(result.error.issues)
}

// Type-safe parsing
const property: StrictProperty = StrictPropertySchema.parse(data)

// Create validation (omits generated fields)
const newProperty = PropertyCreateSchema.parse({
  title: 'My Property',
  // ... required fields
})
```

### Available Schemas

| Entity | Schemas |
|--------|---------|
| User | `StrictUserSchema`, `UserCreateSchema`, `UserUpdateSchema` |
| Property | `StrictPropertySchema`, `PropertyCreateSchema`, `PropertyUpdateSchema` |
| Inquiry | `StrictInquirySchema`, `InquiryCreateSchema` |
| Message | `StrictMessageSchema`, `MessageCreateSchema` |
| Subscription | `StrictSubscriptionSchema`, `SubscriptionCreateSchema` |
| Payment | `StrictPaymentSchema`, `PaymentCreateSchema` |
| Notification | `StrictNotificationSchema`, `NotificationCreateSchema` |
| Favorite | `StrictFavoriteSchema`, `FavoriteCreateSchema` |
| Bulk Import | `StrictBulkImportJobSchema`, `BulkImportJobCreateSchema` |

---

## 2. Database Triggers (`supabase/migrations/20260218_architectural_safeguards.sql`)

### Purpose
Enforces data integrity, audit logging, and business rules at the database level.

### Key Features
- **Validation triggers** - Reject invalid data before insertion
- **Audit logging** - Track all changes to critical tables
- **Status transitions** - Enforce valid state machine transitions
- **Automatic timestamps** - Consistent created_at/updated_at management

### Validation Triggers

| Trigger | Purpose |
|---------|---------|
| `validate_property_room_type()` | Ensures PG/Co-living don't use 'Apartment' room type |
| `validate_property_pricing()` | Requires at least one price for active properties |
| `validate_floor_numbers()` | Ensures floor_number <= total_floors |
| `validate_coordinates()` | Validates latitude/longitude ranges |
| `validate_email_format()` | Normalizes and validates email format |
| `validate_phone_format()` | Normalizes phone to 10 digits |
| `validate_subscription_dates()` | Ensures end_date > start_date |
| `validate_payment_amount()` | Validates positive payment amounts |

### Audit Logging

All changes to main tables are logged to `audit_logs`:

```sql
-- Query audit trail for a property
SELECT * FROM get_audit_trail('properties', 'property-uuid-here');
```

### Status Transition Enforcement

Properties must follow valid state transitions:
- `pending` -> `active`, `rejected`
- `active` -> `inactive`, `pending`
- `inactive` -> `active`, `pending`
- `rejected` -> `pending`

---

## 3. Runtime Assertions (`lib/utils/runtime-assertions.ts`)

### Purpose
Defensive programming utilities for runtime validation with comprehensive error context.

### Key Features
- **Type assertions** - Verify types at runtime
- **Range assertions** - Validate numeric ranges
- **Business assertions** - Validate domain-specific rules
- **Async assertions** - Handle promise validation
- **Detailed context** - Rich error information for debugging

### Usage Examples

```typescript
import {
  assertDefined,
  assertPositive,
  assertValidPropertyType,
  assertOneOf,
  AssertionError
} from '@/lib/utils'

function processProperty(data: unknown) {
  // Assert existence
  assertDefined(data, 'Property data is required')

  // Assert type
  assertObject(data, 'Data must be an object')

  // Assert business rules
  assertValidPropertyType(data.propertyType, 'Invalid property type')
  assertPositive(data.price, 'Price must be positive')

  // Assert enum values
  assertOneOf(data.status, ['active', 'pending', 'inactive'], 'Invalid status')

  // All assertions passed, data is safe to use
  return data
}

// Error handling
try {
  processProperty(invalidData)
} catch (error) {
  if (error instanceof AssertionError) {
    console.error(error.code)      // 'ASSERT_RANGE_ERROR'
    console.error(error.context)   // { actualValue: -100, expectedRange: '> 0' }
    console.error(error.timestamp) // ISO timestamp
  }
}
```

### Available Assertions

| Category | Assertions |
|----------|------------|
| Existence | `assertDefined`, `assertNotNull`, `assertNotUndefined` |
| Types | `assertString`, `assertNumber`, `assertBoolean`, `assertArray`, `assertObject`, `assertFunction` |
| Ranges | `assertPositive`, `assertNonNegative`, `assertInRange`, `assertInteger` |
| Strings | `assertNotEmpty`, `assertMatches`, `assertMinLength`, `assertMaxLength` |
| Collections | `assertNotEmptyArray`, `assertArrayMinLength`, `assertArrayMaxLength`, `assertUnique` |
| Enums | `assertOneOf`, `assertUUID`, `assertEmail`, `assertURL` |
| Business | `assertValidPropertyType`, `assertValidRoomType`, `assertValidPrice`, `assertValidPincode`, `assertValidPhone` |
| Async | `assertResolves`, `assertRejects` |
| Development | `devAssert`, `devWarn` |

---

## 4. TypeScript Branded Types (`lib/types/branded.ts`)

### Purpose
Type-safe wrappers for primitive types to prevent mixing different semantic types (e.g., UserId vs PropertyId).

### Key Features
- **Type discrimination** - Compiler prevents mixing branded types
- **Runtime validation** - Factory functions validate format
- **Zod integration** - Seamless integration with Zod schemas
- **Safe parsing** - Non-throwing variants available

### Usage Examples

```typescript
import {
  UserId,
  PropertyId,
  Email,
  CurrencyAmount,
  safeEmail
} from '@/lib/types'

// Creating branded types (validated at runtime)
const userId = UserId('550e8400-e29b-41d4-a716-446655440000')
const propertyId = PropertyId('550e8400-e29b-41d4-a716-446655440001')
const email = Email('user@example.com')
const price = CurrencyAmount(500000) // paise

// Type safety - these will cause compile errors:
const wrong: UserId = propertyId  // Error: PropertyId not assignable to UserId
function processUser(id: UserId) { }
processUser(propertyId)           // Error: Argument type mismatch

// Safe parsing (returns null on failure)
const maybeEmail = safeEmail('invalid')
if (maybeEmail) {
  // Type-safe email usage
}

// With Zod schemas
import { UserIdSchema, EmailSchema } from '@/lib/types'

const UserSchema = z.object({
  id: UserIdSchema,
  email: EmailSchema,
})
```

### Available Branded Types

| Category | Types |
|----------|-------|
| IDs | `UserId`, `PropertyId`, `InquiryId`, `MessageId`, `SubscriptionId`, `PaymentId`, `NotificationId`, `FavoriteId`, `BulkImportJobId` |
| Domain Values | `Email`, `PhoneNumber`, `Pincode`, `UUID`, `URLString`, `ISO8601Date` |
| Numeric | `CurrencyAmount`, `Percentage`, `Latitude`, `Longitude`, `NonNegativeInteger`, `PositiveInteger` |

---

## 5. Error Logging (`lib/utils/error-logger.ts`)

### Purpose
Structured error logging with severity levels, context tracking, and multiple output strategies.

### Key Features
- **Structured logging** - Consistent error schema
- **Severity levels** - debug, info, warning, error, critical
- **Error deduplication** - Prevent log flooding
- **Rate limiting** - Control error volume
- **Context redaction** - Automatic PII removal
- **Correlation IDs** - Trace related errors

### Usage Examples

```typescript
import { createErrorLogger, logError } from '@/lib/utils'

// Create a logger for a specific component
const logger = createErrorLogger('PaymentService')

// Set correlation ID for tracing
logger.setCorrelationId('payment-123')

// Log with different severity levels
logger.debug({
  code: 'PAYMENT_INIT',
  message: 'Starting payment process',
  context: { orderId: '123' }
})

logger.error({
  code: 'PAYMENT_FAILED',
  message: 'Payment processing failed',
  cause: error,
  context: { orderId: '123', amount: 5000 }
})

logger.critical({
  code: 'DATABASE_CONNECTION_LOST',
  message: 'Cannot connect to primary database',
  context: { host: 'db.example.com', port: 5432 }
})

// Global logger for quick logging
logError({
  code: 'UNEXPECTED_ERROR',
  message: 'Something went wrong',
  severity: 'error'
})

// API route error handling
import { withErrorLogging } from '@/lib/utils'

const handler = withErrorLogging(async (req, res) => {
  // Errors automatically logged
  await processPayment(req.body)
}, '/api/payments')
```

### Error Log Entry Schema

```typescript
interface ErrorLogEntry {
  id: string                    // Unique error ID
  timestamp: string             // ISO 8601 timestamp
  severity: ErrorSeverity       // debug | info | warning | error | critical
  code: string                  // Error category code
  message: string               // Human-readable message
  source: string                // Component name
  context?: ErrorContext        // Additional context
  cause?: unknown              // Original error
  stack?: string               // Stack trace
  correlationId?: string       // Tracing ID
  userId?: string              // Affected user
  url?: string                 // Request URL
  userAgent?: string           // Client user agent
}
```

---

## Integration Patterns

### Combined Usage Example

```typescript
import {
  StrictPropertySchema,
  PropertyCreateSchema
} from '@/lib/validations'
import {
  assertDefined,
  assertValidPrice,
  createErrorLogger
} from '@/lib/utils'
import {
  PropertyId,
  UserId,
  CurrencyAmount
} from '@/lib/types'

const logger = createErrorLogger('PropertyService')

async function createProperty(
  ownerId: string,
  data: unknown
): Promise<Property> {
  const correlationId = logger.getCorrelationId()

  try {
    // 1. Runtime assertions for preconditions
    assertDefined(data, 'Property data required')

    // 2. Branded types for ID safety
    const ownerUserId = UserId(ownerId)

    // 3. Zod schema validation
    const validated = PropertyCreateSchema.parse({
      ...data,
      owner_id: ownerUserId
    })

    // 4. Additional business assertions
    assertValidPrice(validated.pricing.private_room_price || 0)

    // 5. Database insert (triggers will validate further)
    const { data: property, error } = await supabase
      .from('properties')
      .insert(validated)
      .select()
      .single()

    if (error) throw error

    // 6. Return with branded ID
    return {
      ...property,
      id: PropertyId(property.id)
    }

  } catch (error) {
    // 7. Structured error logging
    logger.error({
      code: 'PROPERTY_CREATE_FAILED',
      message: 'Failed to create property',
      cause: error,
      context: { ownerId, correlationId }
    })
    throw error
  }
}
```

---

## Best Practices

### 1. Validation at Boundaries
Always validate at system boundaries (API inputs, external data):

```typescript
// API Route
export async function POST(request: Request) {
  const body = await request.json()

  // Validate at boundary
  const result = PropertyCreateSchema.safeParse(body)
  if (!result.success) {
    return Response.json({
      success: false,
      errors: result.error.issues
    }, { status: 400 })
  }

  // Data is now type-safe
  await createProperty(result.data)
}
```

### 2. Use Branded Types for IDs
Prevent ID mixing bugs:

```typescript
// Bad
function getProperty(userId: string, propertyId: string)

// Good
function getProperty(userId: UserId, propertyId: PropertyId)
```

### 3. Assert Early, Assert Often
Use runtime assertions for defense in depth:

```typescript
function calculateTotal(items: unknown[]) {
  assertArray(items, 'Items must be an array')
  assertNotEmptyArray(items, 'Items cannot be empty')

  return items.reduce((sum, item) => {
    assertObject(item, 'Item must be an object')
    assertHasProperty(item, 'price')
    assertPositive(item.price, 'Price must be positive')

    return sum + item.price
  }, 0)
}
```

### 4. Log with Context
Always include relevant context in error logs:

```typescript
logger.error({
  code: 'PAYMENT_FAILED',
  message: 'Payment processing failed',
  context: {
    orderId: order.id,
    userId: user.id,
    amount: order.amount,
    paymentMethod: order.method
  }
})
```

### 5. Handle All Error Cases
Use exhaustive error handling:

```typescript
const result = StrictPropertySchema.safeParse(data)

if (!result.success) {
  // Log validation errors
  logger.warning({
    code: 'VALIDATION_FAILED',
    message: 'Property validation failed',
    context: {
      issues: result.error.issues,
      input: data
    }
  })

  // Return user-friendly errors
  return {
    success: false,
    errors: result.error.flatten().fieldErrors
  }
}
```

---

## Migration Guide

### Adding Branded Types to Existing Code

1. Import branded types:
```typescript
import { UserId, PropertyId } from '@/lib/types'
```

2. Update function signatures:
```typescript
// Before
function getUserProperties(userId: string)

// After
function getUserProperties(userId: UserId)
```

3. Create branded values at boundaries:
```typescript
const userId = UserId(params.id) // Validates and brands
```

### Adding Zod Validation to Existing Forms

1. Import strict schemas:
```typescript
import { PropertyCreateSchema } from '@/lib/validations'
```

2. Replace manual validation:
```typescript
// Before
if (!data.title || data.title.length < 10) {
  errors.push('Title too short')
}

// After
const result = PropertyCreateSchema.safeParse(data)
if (!result.success) {
  return { errors: result.error.issues }
}
```

### Adding Assertions to Critical Paths

1. Identify critical functions
2. Add assertions at entry points:
```typescript
function processPayment(order: unknown) {
  assertDefined(order, 'Order required')
  assertObject(order, 'Order must be object')
  assertHasProperty(order, 'amount')
  assertPositive(order.amount, 'Amount must be positive')

  // Process with confidence
}
```

---

## Summary

These architectural safeguards provide:

1. **Type Safety** - Branded types prevent mixing of semantic types
2. **Data Integrity** - Database triggers enforce constraints at the lowest level
3. **Input Validation** - Zod schemas validate all external data
4. **Defensive Programming** - Runtime assertions catch bugs early
5. **Observability** - Structured logging enables debugging and monitoring

Together, they create multiple layers of protection that catch errors at compile time, runtime, and database level, significantly reducing the likelihood of bugs reaching production.
