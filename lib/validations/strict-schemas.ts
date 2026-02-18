/**
 * Strict Zod Validation Schemas
 *
 * Provides comprehensive, strict Zod schemas for all domain entities.
 * These schemas enforce type safety, business rules, and data integrity
 * at the application boundary.
 *
 * Features:
 * - Strict type checking with no coercion
 * - Business rule validation
 * - Custom error messages
 * - Transform pipelines for data normalization
 * - Composition patterns for reusable validators
 *
 * @example
 * const result = StrictPropertySchema.safeParse(untrustedData)
 * if (!result.success) {
 *   // Handle validation errors
 * }
 */

import { z } from 'zod'
import {
    UserId,
    PropertyId,
    InquiryId,
    MessageId,
    SubscriptionId,
    PaymentId,
    Email,
    PhoneNumber,
    Pincode,
    CurrencyAmount,
    Latitude,
    Longitude,
    NonNegativeInteger,
    UserIdSchema,
    PropertyIdSchema,
    InquiryIdSchema,
    MessageIdSchema,
    SubscriptionIdSchema,
    PaymentIdSchema,
    EmailSchema,
    PhoneNumberSchema,
    PincodeSchema,
    CurrencyAmountSchema,
    LatitudeSchema,
    LongitudeSchema,
    NonNegativeIntegerSchema,
} from '@/lib/types/branded'

// ============================================================================
// Reusable Validation Helpers
// ============================================================================

const ValidationUtils = {
    /**
     * Create a schema that strips unknown keys (strict object)
     */
    strictObject: <T extends z.ZodRawShape>(shape: T) =>
        z.object(shape).strict(),

    /**
     * Create a schema with custom error message
     */
    withMessage: <T extends z.ZodTypeAny>(schema: T, message: string) =>
        schema.refine((val) => schema.safeParse(val).success, { message }),

    /**
     * Create a trimmed string schema
     */
    trimmedString: (min: number, max: number) =>
        z.string()
            .min(min, `Must be at least ${min} characters`)
            .max(max, `Must be at most ${max} characters`)
            .transform((s) => s.trim()),

    /**
     * Create an enum schema with error message
     */
    enum: <T extends [string, ...string[]]>(values: T, fieldName: string) =>
        z.enum(values, {
            errorMap: () => ({ message: `Invalid ${fieldName}. Must be one of: ${values.join(', ')}` }),
        }),

    /**
     * Create a price schema (positive integer, max 10M)
     */
    price: () =>
        z.number()
            .int('Price must be a whole number')
            .positive('Price must be positive')
            .max(10000000, 'Price cannot exceed 1 crore'),

    /**
     * Create an optional price schema
     */
    optionalPrice: () =>
        z.number()
            .int('Price must be a whole number')
            .nonnegative('Price cannot be negative')
            .max(10000000, 'Price cannot exceed 1 crore')
            .optional(),

    /**
     * Create a coordinate schema
     */
    coordinates: () =>
        z.object({
            latitude: LatitudeSchema,
            longitude: LongitudeSchema,
        }),

    /**
     * Create a timestamp schema
     */
    timestamp: () =>
        z.string().datetime({ message: 'Invalid ISO 8601 timestamp' }),

    /**
     * Create a non-empty array schema
     */
    nonEmptyArray: <T extends z.ZodTypeAny>(itemSchema: T, fieldName: string) =>
        z.array(itemSchema)
            .min(1, `At least one ${fieldName} is required`),

    /**
     * Create a limited array schema
     */
    limitedArray: <T extends z.ZodTypeAny>(itemSchema: T, max: number, fieldName: string) =>
        z.array(itemSchema)
            .max(max, `Cannot have more than ${max} ${fieldName}`),
}

// ============================================================================
// User Schemas
// ============================================================================

export const UserRoleSchema = ValidationUtils.enum(['admin', 'owner', 'tenant'], 'role')

export const UserStatusSchema = ValidationUtils.enum(['active', 'inactive', 'suspended'], 'status')

export const UserPreferencesSchema = z.object({
    notifications: z.boolean().default(true),
    newsletter: z.boolean().default(false),
    darkMode: z.boolean().default(false),
    language: z.enum(['en', 'hi', 'ta', 'te', 'kn', 'mr']).default('en'),
}).strict()

export const StrictUserSchema = z.object({
    id: UserIdSchema,
    email: EmailSchema,
    name: ValidationUtils.trimmedString(2, 100),
    phone: PhoneNumberSchema.optional(),
    role: UserRoleSchema,
    avatar_url: z.string().url().optional(),
    verified: z.boolean().default(false),
    status: UserStatusSchema.default('active'),
    city: z.string().min(2).max(100).optional(),
    address: z.string().max(500).optional(),
    business_name: z.string().max(200).optional(),
    gst_number: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GST format').optional(),
    bank_name: z.string().max(100).optional(),
    account_number: z.string().max(20).optional(),
    ifsc_code: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC format').optional(),
    account_holder_name: z.string().max(100).optional(),
    preferences: UserPreferencesSchema,
    created_at: ValidationUtils.timestamp(),
    updated_at: ValidationUtils.timestamp(),
}).strict()

export const UserCreateSchema = StrictUserSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
}).extend({
    password: z.string().min(8).max(100),
})

export const UserUpdateSchema = StrictUserSchema.partial().omit({
    id: true,
    email: true,
    created_at: true,
    updated_at: true,
})

// ============================================================================
// Property Schemas
// ============================================================================

export const PropertyTypeSchema = ValidationUtils.enum(['PG', 'Co-living', 'Rent'], 'property type')

export const RoomTypeSchema = ValidationUtils.enum(
    ['Single', 'Double', 'Triple', 'Four Sharing', 'Apartment', '1RK'],
    'room type'
)

export const PropertyStatusSchema = ValidationUtils.enum(
    ['active', 'inactive', 'pending', 'rejected'],
    'status'
)

export const AvailabilitySchema = ValidationUtils.enum(
    ['Available', 'Occupied', 'Under Maintenance'],
    'availability'
)

export const FurnishingSchema = ValidationUtils.enum(
    ['Fully Furnished', 'Semi Furnished', 'Unfurnished'],
    'furnishing'
)

export const PreferredTenantSchema = ValidationUtils.enum(
    ['Male', 'Female', 'Couple'],
    'preferred tenant'
)

export const LocationSchema = z.object({
    country: z.string().default('India'),
    city: ValidationUtils.trimmedString(2, 100),
    area: ValidationUtils.trimmedString(2, 100),
    locality: z.string().max(100).optional(),
    address: z.string().min(10).max(500),
    landmark: z.string().max(200).optional(),
    pincode: PincodeSchema.optional(),
    latitude: LatitudeSchema.optional(),
    longitude: LongitudeSchema.optional(),
    google_maps_url: z.string().url().optional(),
}).strict()

export const PricingSchema = z.object({
    one_rk_price: ValidationUtils.optionalPrice(),
    private_room_price: ValidationUtils.optionalPrice(),
    double_sharing_price: ValidationUtils.optionalPrice(),
    triple_sharing_price: ValidationUtils.optionalPrice(),
    four_sharing_price: ValidationUtils.optionalPrice(),
    deposit: ValidationUtils.optionalPrice(),
    maintenance: ValidationUtils.optionalPrice(),
}).strict().refine(
    (data) => {
        // At least one price must be set
        const prices = [
            data.one_rk_price,
            data.private_room_price,
            data.double_sharing_price,
            data.triple_sharing_price,
            data.four_sharing_price,
        ].filter(Boolean)
        return prices.length > 0
    },
    { message: 'At least one price must be specified', path: ['pricing'] }
)

export const PropertyDetailsSchema = z.object({
    furnishing: FurnishingSchema.optional(),
    floor_number: z.number().int().min(0).max(200).optional(),
    total_floors: z.number().int().min(1).max(200).optional(),
    room_size: z.number().int().min(50).max(10000).optional(),
    preferred_tenant: PreferredTenantSchema.optional(),
}).strict().refine(
    (data) => {
        if (data.floor_number !== undefined && data.total_floors !== undefined) {
            return data.floor_number <= data.total_floors
        }
        return true
    },
    { message: 'Floor number cannot exceed total floors', path: ['floor_number'] }
)

export const StrictPropertySchema = z.object({
    id: PropertyIdSchema,

    // Basic Info
    title: ValidationUtils.trimmedString(10, 100),
    description: z.string().min(50).max(2000),
    property_type: PropertyTypeSchema,
    room_type: RoomTypeSchema,

    // Location
    location: LocationSchema,

    // Owner Info
    owner_id: UserIdSchema,
    owner_name: ValidationUtils.trimmedString(2, 100),
    owner_contact: PhoneNumberSchema,
    owner_verified: z.boolean().default(false),

    // Pricing
    pricing: PricingSchema,

    // Details
    details: PropertyDetailsSchema,

    // Features
    facilities: z.array(z.string().max(50)).max(30).default([]),
    amenities: z.array(z.string().max(50)).max(30).default([]),
    usp: z.string().max(500).optional(),
    rules: z.array(z.string().max(200)).max(20).default([]),
    nearby_places: z.array(z.string().max(100)).max(10).default([]),

    // Media
    images: z.array(z.string().url()).min(1).max(10),
    videos: z.array(z.string().url()).max(5).default([]),

    // Status
    availability: AvailabilitySchema.default('Available'),
    featured: z.boolean().default(false),
    verified: z.boolean().default(false),
    status: PropertyStatusSchema.default('pending'),

    // Metadata
    views: z.number().int().nonnegative().default(0),
    psn: z.number().int().positive().optional(),
    source: z.enum(['manual', 'excel_import', 'api']).default('manual'),

    // Timestamps
    created_at: ValidationUtils.timestamp(),
    updated_at: ValidationUtils.timestamp(),
    published_at: ValidationUtils.timestamp().optional(),
}).strict()

export const PropertyCreateSchema = StrictPropertySchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
    published_at: true,
    views: true,
})

export const PropertyUpdateSchema = StrictPropertySchema.partial().omit({
    id: true,
    owner_id: true,
    created_at: true,
    updated_at: true,
})

// ============================================================================
// Inquiry Schemas
// ============================================================================

export const InquiryStatusSchema = ValidationUtils.enum(
    ['pending', 'responded', 'closed'],
    'inquiry status'
)

export const StrictInquirySchema = z.object({
    id: InquiryIdSchema,
    property_id: PropertyIdSchema,
    tenant_id: UserIdSchema,
    owner_id: UserIdSchema,
    message: z.string().min(10).max(1000),
    status: InquiryStatusSchema.default('pending'),
    created_at: ValidationUtils.timestamp(),
    updated_at: ValidationUtils.timestamp(),
}).strict()

export const InquiryCreateSchema = StrictInquirySchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
    status: true,
})

// ============================================================================
// Message Schemas
// ============================================================================

const StrictMessageSchemaBase = z.object({
    id: z.string().uuid(),
    sender_id: UserIdSchema,
    receiver_id: UserIdSchema,
    property_id: PropertyIdSchema.optional(),
    content: z.string().min(1).max(2000),
    read: z.boolean().default(false),
    created_at: ValidationUtils.timestamp(),
}).strict()

export const StrictMessageSchema = StrictMessageSchemaBase.refine(
    (data) => data.sender_id !== data.receiver_id,
    { message: 'Sender and receiver cannot be the same', path: ['receiver_id'] }
)

export const MessageCreateSchema = StrictMessageSchemaBase.omit({
    id: true,
    created_at: true,
    read: true,
})

// ============================================================================
// Subscription Schemas
// ============================================================================

export const SubscriptionStatusSchema = ValidationUtils.enum(
    ['active', 'expired', 'cancelled'],
    'subscription status'
)

export const PlanDurationSchema = ValidationUtils.enum(
    ['1_month', '3_months', '6_months', '1_year'],
    'plan duration'
)

const StrictSubscriptionSchemaBase = z.object({
    id: z.string().uuid(),
    user_id: UserIdSchema,
    plan_name: z.string().min(1).max(50),
    plan_duration: PlanDurationSchema,
    amount: CurrencyAmountSchema,
    status: SubscriptionStatusSchema.default('active'),
    properties_limit: z.number().int().positive(),
    start_date: ValidationUtils.timestamp(),
    end_date: ValidationUtils.timestamp(),
    created_at: ValidationUtils.timestamp(),
}).strict()

export const StrictSubscriptionSchema = StrictSubscriptionSchemaBase.refine(
    (data) => new Date(data.end_date) > new Date(data.start_date),
    { message: 'End date must be after start date', path: ['end_date'] }
)

export const SubscriptionCreateSchema = StrictSubscriptionSchemaBase.omit({
    id: true,
    created_at: true,
    status: true,
})

// ============================================================================
// Payment Schemas
// ============================================================================

export const PaymentStatusSchema = ValidationUtils.enum(
    ['pending', 'success', 'failed', 'refunded'],
    'payment status'
)

export const StrictPaymentSchema = z.object({
    id: z.string().uuid(),
    user_id: UserIdSchema,
    subscription_id: z.string().uuid().optional(),
    amount: CurrencyAmountSchema,
    currency: z.string().length(3).default('INR'),
    payment_method: z.string().max(50).optional(),
    payment_gateway: z.string().max(50).optional(),
    transaction_id: z.string().max(100).optional(),
    status: PaymentStatusSchema.default('pending'),
    created_at: ValidationUtils.timestamp(),
}).strict()

export const PaymentCreateSchema = StrictPaymentSchema.omit({
    id: true,
    created_at: true,
})

// ============================================================================
// Notification Schemas
// ============================================================================

export const NotificationTypeSchema = ValidationUtils.enum(
    ['inquiry', 'message', 'payment', 'system'],
    'notification type'
)

export const StrictNotificationSchema = z.object({
    id: z.string().uuid(),
    user_id: UserIdSchema,
    type: NotificationTypeSchema,
    title: z.string().min(1).max(100),
    content: z.string().min(1).max(500),
    action_url: z.string().url().max(500).optional(),
    read: z.boolean().default(false),
    created_at: ValidationUtils.timestamp(),
}).strict()

export const NotificationCreateSchema = StrictNotificationSchema.omit({
    id: true,
    created_at: true,
    read: true,
})

// ============================================================================
// Favorite Schemas
// ============================================================================

export const StrictFavoriteSchema = z.object({
    id: z.string().uuid(),
    user_id: UserIdSchema,
    property_id: PropertyIdSchema,
    created_at: ValidationUtils.timestamp(),
}).strict()

export const FavoriteCreateSchema = StrictFavoriteSchema.omit({
    id: true,
    created_at: true,
})

// ============================================================================
// Bulk Import Schemas
// ============================================================================

export const BulkImportStatusSchema = ValidationUtils.enum(
    ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    'import status'
)

export const StrictBulkImportJobSchema = z.object({
    id: z.string().uuid(),
    user_id: UserIdSchema,
    filename: z.string().min(1).max(255),
    status: BulkImportStatusSchema.default('pending'),
    total_rows: z.number().int().nonnegative(),
    processed_rows: z.number().int().nonnegative().default(0),
    success_count: z.number().int().nonnegative().default(0),
    error_count: z.number().int().nonnegative().default(0),
    errors: z.array(z.object({
        row: z.number().int().positive(),
        message: z.string(),
        data: z.record(z.unknown()).optional(),
    })).default([]),
    metadata: z.record(z.unknown()).default({}),
    created_at: ValidationUtils.timestamp(),
    updated_at: ValidationUtils.timestamp(),
    completed_at: ValidationUtils.timestamp().optional(),
}).strict()

export const BulkImportJobCreateSchema = StrictBulkImportJobSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
    completed_at: true,
    processed_rows: true,
    success_count: true,
    error_count: true,
    errors: true,
})

// ============================================================================
// Search/Filter Schemas
// ============================================================================

export const PropertySearchFiltersSchema = z.object({
    location: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    area: z.string().max(100).optional(),
    property_type: z.enum(['PG', 'Co-living', 'Rent', 'All']).optional(),
    room_type: z.enum(['Single', 'Double', 'Triple', 'Four Sharing', 'Apartment', '1RK', 'All']).optional(),
    min_price: z.number().int().nonnegative().optional(),
    max_price: z.number().int().nonnegative().optional(),
    amenities: z.array(z.string()).max(20).optional(),
    furnishing: z.enum(['Fully Furnished', 'Semi Furnished', 'Unfurnished', 'All']).optional(),
    preferred_tenant: z.enum(['Male', 'Female', 'Any', 'All']).optional(),
    sort_by: z.enum(['price_asc', 'price_desc', 'date_desc', 'popular']).optional(),
    page: z.number().int().positive().default(1),
    limit: z.number().int().positive().max(100).default(20),
}).strict().refine(
    (data) => {
        if (data.min_price !== undefined && data.max_price !== undefined) {
            return data.min_price <= data.max_price
        }
        return true
    },
    { message: 'Min price cannot exceed max price', path: ['max_price'] }
).refine(
    (data) => {
        if (data.page && data.limit) {
            return data.page * data.limit <= 10000 // Max offset
        }
        return true
    },
    { message: 'Pagination offset too large', path: ['page'] }
)

// ============================================================================
// API Request/Response Schemas
// ============================================================================

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
    z.object({
        success: z.boolean(),
        data: dataSchema.optional(),
        error: z.string().optional(),
        meta: z.object({
            total: z.number().int().nonnegative().optional(),
            page: z.number().int().positive().optional(),
            limit: z.number().int().positive().optional(),
            has_more: z.boolean().optional(),
        }).optional(),
    }).strict()

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
    z.object({
        items: z.array(itemSchema),
        total: z.number().int().nonnegative(),
        page: z.number().int().positive(),
        limit: z.number().int().positive(),
        has_more: z.boolean(),
    }).strict()

// ============================================================================
// Authentication Schemas
// ============================================================================

export const LoginSchema = z.object({
    email: EmailSchema,
    password: z.string().min(1, 'Password is required'),
}).strict()

export const RegisterSchema = z.object({
    name: ValidationUtils.trimmedString(2, 100),
    email: EmailSchema,
    phone: PhoneNumberSchema,
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(100, 'Password too long')
        .regex(/[A-Z]/, 'Password must contain an uppercase letter')
        .regex(/[a-z]/, 'Password must contain a lowercase letter')
        .regex(/[0-9]/, 'Password must contain a number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain a special character'),
    confirm_password: z.string(),
    role: z.enum(['owner', 'tenant'], {
        errorMap: () => ({ message: 'Role must be owner or tenant' }),
    }),
}).strict().refine(
    (data) => data.password === data.confirm_password,
    { message: 'Passwords do not match', path: ['confirm_password'] }
)

export const PasswordResetSchema = z.object({
    token: z.string().min(1, 'Token is required'),
    password: z.string().min(8).max(100),
    confirm_password: z.string(),
}).strict().refine(
    (data) => data.password === data.confirm_password,
    { message: 'Passwords do not match', path: ['confirm_password'] }
)

// ============================================================================
// Type Exports
// ============================================================================

export type StrictUser = z.infer<typeof StrictUserSchema>
export type UserCreate = z.infer<typeof UserCreateSchema>
export type UserUpdate = z.infer<typeof UserUpdateSchema>

export type StrictProperty = z.infer<typeof StrictPropertySchema>
export type PropertyCreate = z.infer<typeof PropertyCreateSchema>
export type PropertyUpdate = z.infer<typeof PropertyUpdateSchema>

export type StrictInquiry = z.infer<typeof StrictInquirySchema>
export type InquiryCreate = z.infer<typeof InquiryCreateSchema>

export type StrictMessage = z.infer<typeof StrictMessageSchema>
export type MessageCreate = z.infer<typeof MessageCreateSchema>

export type StrictSubscription = z.infer<typeof StrictSubscriptionSchema>
export type SubscriptionCreate = z.infer<typeof SubscriptionCreateSchema>

export type StrictPayment = z.infer<typeof StrictPaymentSchema>
export type PaymentCreate = z.infer<typeof PaymentCreateSchema>

export type StrictNotification = z.infer<typeof StrictNotificationSchema>
export type NotificationCreate = z.infer<typeof NotificationCreateSchema>

export type StrictFavorite = z.infer<typeof StrictFavoriteSchema>
export type FavoriteCreate = z.infer<typeof FavoriteCreateSchema>

export type StrictBulkImportJob = z.infer<typeof StrictBulkImportJobSchema>
export type BulkImportJobCreate = z.infer<typeof BulkImportJobCreateSchema>

export type PropertySearchFilters = z.infer<typeof PropertySearchFiltersSchema>

export type LoginInput = z.infer<typeof LoginSchema>
export type RegisterInput = z.infer<typeof RegisterSchema>
export type PasswordResetInput = z.infer<typeof PasswordResetSchema>
