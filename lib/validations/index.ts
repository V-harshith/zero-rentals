/**
 * Validations Index
 *
 * Central export for all validation schemas and utilities.
 */

// Strict Zod Schemas
export {
    // User schemas
    StrictUserSchema,
    UserCreateSchema,
    UserUpdateSchema,
    UserRoleSchema,
    UserStatusSchema,
    UserPreferencesSchema,

    // Property schemas
    StrictPropertySchema,
    PropertyCreateSchema,
    PropertyUpdateSchema,
    PropertyTypeSchema,
    RoomTypeSchema,
    PropertyStatusSchema,
    AvailabilitySchema,
    FurnishingSchema,
    PreferredTenantSchema,
    LocationSchema,
    PricingSchema,
    PropertyDetailsSchema,

    // Inquiry schemas
    StrictInquirySchema,
    InquiryCreateSchema,
    InquiryStatusSchema,

    // Message schemas
    StrictMessageSchema,
    MessageCreateSchema,

    // Subscription schemas
    StrictSubscriptionSchema,
    SubscriptionCreateSchema,
    SubscriptionStatusSchema,
    PlanDurationSchema,

    // Payment schemas
    StrictPaymentSchema,
    PaymentCreateSchema,
    PaymentStatusSchema,

    // Notification schemas
    StrictNotificationSchema,
    NotificationCreateSchema,
    NotificationTypeSchema,

    // Favorite schemas
    StrictFavoriteSchema,
    FavoriteCreateSchema,

    // Bulk import schemas
    StrictBulkImportJobSchema,
    BulkImportJobCreateSchema,
    BulkImportStatusSchema,

    // Search/filter schemas
    PropertySearchFiltersSchema,

    // API schemas
    ApiResponseSchema,
    PaginatedResponseSchema,

    // Auth schemas
    LoginSchema,
    RegisterSchema,
    PasswordResetSchema,

    // Types
    type StrictUser,
    type UserCreate,
    type UserUpdate,
    type StrictProperty,
    type PropertyCreate,
    type PropertyUpdate,
    type StrictInquiry,
    type InquiryCreate,
    type StrictMessage,
    type MessageCreate,
    type StrictSubscription,
    type SubscriptionCreate,
    type StrictPayment,
    type PaymentCreate,
    type StrictNotification,
    type NotificationCreate,
    type StrictFavorite,
    type FavoriteCreate,
    type StrictBulkImportJob,
    type BulkImportJobCreate,
    type PropertySearchFilters,
    type LoginInput,
    type RegisterInput,
    type PasswordResetInput,
} from './strict-schemas'

// Legacy schemas (for backward compatibility)
export {
    propertySchema,
    loginSchema,
    signupSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    inquirySchema,
    messageSchema,
    profileUpdateSchema,
    searchFiltersSchema,
    type PropertyFormData,
    type LoginFormData,
    type SignupFormData,
    type ForgotPasswordFormData,
    type ResetPasswordFormData,
    type InquiryFormData,
    type MessageFormData,
    type ProfileUpdateFormData,
    type SearchFiltersFormData,
} from '@/lib/validation-schemas'

// Property schema from validations folder
export {
    propertySchema as PropertyFormSchema,
    type PropertyFormData as PropertyFormDataV2,
} from './property-schema'
