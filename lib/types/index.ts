/**
 * Type Definitions Index
 *
 * Central export for all type definitions in the application.
 * Organized by domain and concern for easy imports.
 */

// ============================================================================
// Branded Types - Type-safe wrappers for primitives
// ============================================================================

export {
    // ID Types
    UserId,
    PropertyId,
    InquiryId,
    MessageId,
    SubscriptionId,
    PaymentId,
    NotificationId,
    FavoriteId,
    BulkImportJobId,

    // Domain Value Types
    Email,
    PhoneNumber,
    Pincode,
    UUID,
    URLString,
    ISO8601Date,
    CurrencyAmount,
    Percentage,
    Latitude,
    Longitude,

    // Business Logic Types
    NonNegativeInteger,
    PositiveInteger,

    // Factory Functions
    UserId as UserIdFactory,
    PropertyId as PropertyIdFactory,
    InquiryId as InquiryIdFactory,
    MessageId as MessageIdFactory,
    SubscriptionId as SubscriptionIdFactory,
    PaymentId as PaymentIdFactory,
    NotificationId as NotificationIdFactory,
    FavoriteId as FavoriteIdFactory,
    BulkImportJobId as BulkImportJobIdFactory,
    Email as EmailFactory,
    PhoneNumber as PhoneNumberFactory,
    Pincode as PincodeFactory,
    UUID as UUIDFactory,
    URLString as URLStringFactory,
    ISO8601Date as ISO8601DateFactory,
    CurrencyAmount as CurrencyAmountFactory,
    Percentage as PercentageFactory,
    Latitude as LatitudeFactory,
    Longitude as LongitudeFactory,
    NonNegativeInteger as NonNegativeIntegerFactory,
    PositiveInteger as PositiveIntegerFactory,

    // Zod Schemas
    UserIdSchema,
    PropertyIdSchema,
    InquiryIdSchema,
    MessageIdSchema,
    SubscriptionIdSchema,
    PaymentIdSchema,
    NotificationIdSchema,
    FavoriteIdSchema,
    BulkImportJobIdSchema,
    EmailSchema,
    PhoneNumberSchema,
    PincodeSchema,
    UUIDSchema,
    URLStringSchema,
    ISO8601DateSchema,
    CurrencyAmountSchema,
    PercentageSchema,
    LatitudeSchema,
    LongitudeSchema,
    NonNegativeIntegerSchema,
    PositiveIntegerSchema,

    // Type Guards
    isValidUUID,
    isValidEmail,
    isValidPhoneNumber,
    isValidPincode,
    isValidURL,

    // Safe Parsing
    safeUserId,
    safePropertyId,
    safeEmail,
    safePhoneNumber,
    safePincode,
    safeCurrencyAmount,
    safeLatitude,
    safeLongitude,
} from './branded'

// ============================================================================
// Re-export legacy types for backward compatibility
// ============================================================================

export type {
    Property,
    User,
    SearchFilters,
    Message,
    Conversation,
    Notification,
    ExportUser,
    Inquiry,
    Payment,
} from '@/lib/types'
