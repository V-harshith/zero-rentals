/**
 * Branded Types Module
 *
 * Provides type-safe wrappers for primitive types that have semantic meaning.
 * This prevents accidental mixing of different ID types, emails, etc.
 *
 * @example
 * const userId = UserId("550e8400-e29b-41d4-a716-446655440000")
 * const propertyId = PropertyId("550e8400-e29b-41d4-a716-446655440001")
 *
 * // Type error: Cannot assign PropertyId to UserId
 * const wrong: UserId = propertyId // Error!
 */

import { z } from 'zod'

// ============================================================================
// Brand Symbol Types
// ============================================================================

declare const __brand: unique symbol
declare const __brandType: unique symbol

type Brand<B> = { [__brand]: B }
type BrandType<T, B> = T & Brand<B>

// ============================================================================
// ID Types - Prevent mixing different entity IDs
// ============================================================================

export type UserId = BrandType<string, 'UserId'>
export type PropertyId = BrandType<string, 'PropertyId'>
export type InquiryId = BrandType<string, 'InquiryId'>
export type MessageId = BrandType<string, 'MessageId'>
export type SubscriptionId = BrandType<string, 'SubscriptionId'>
export type PaymentId = BrandType<string, 'PaymentId'>
export type NotificationId = BrandType<string, 'NotificationId'>
export type FavoriteId = BrandType<string, 'FavoriteId'>
export type BulkImportJobId = BrandType<string, 'BulkImportJobId'>

// ============================================================================
// Domain Value Types - Ensure semantic correctness
// ============================================================================

export type Email = BrandType<string, 'Email'>
export type PhoneNumber = BrandType<string, 'PhoneNumber'>
export type Pincode = BrandType<string, 'Pincode'>
export type UUID = BrandType<string, 'UUID'>
export type URLString = BrandType<string, 'URLString'>
export type ISO8601Date = BrandType<string, 'ISO8601Date'>
export type CurrencyAmount = BrandType<number, 'CurrencyAmount'>
export type Percentage = BrandType<number, 'Percentage'>
export type Latitude = BrandType<number, 'Latitude'>
export type Longitude = BrandType<number, 'Longitude'>

// ============================================================================
// Business Logic Types - Enforce business constraints
// ============================================================================

export type ActiveProperty = BrandType<PropertyId, 'ActiveProperty'>
export type VerifiedUser = BrandType<UserId, 'VerifiedUser'>
export type NonNegativeInteger = BrandType<number, 'NonNegativeInteger'>
export type PositiveInteger = BrandType<number, 'PositiveInteger'>

// ============================================================================
// Factory Functions with Validation
// ============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_REGEX = /^[6-9]\d{9}$/
const PINCODE_REGEX = /^\d{6}$/
const URL_REGEX = /^https?:\/\/.+/

/**
 * Create a validated UserId
 * @throws Error if invalid UUID format
 */
export function UserId(value: string): UserId {
    if (!UUID_REGEX.test(value)) {
        throw new Error(`Invalid UserId format: ${value}. Expected valid UUID.`)
    }
    return value as UserId
}

/**
 * Create a validated PropertyId
 * @throws Error if invalid UUID format
 */
export function PropertyId(value: string): PropertyId {
    if (!UUID_REGEX.test(value)) {
        throw new Error(`Invalid PropertyId format: ${value}. Expected valid UUID.`)
    }
    return value as PropertyId
}

/**
 * Create a validated InquiryId
 * @throws Error if invalid UUID format
 */
export function InquiryId(value: string): InquiryId {
    if (!UUID_REGEX.test(value)) {
        throw new Error(`Invalid InquiryId format: ${value}. Expected valid UUID.`)
    }
    return value as InquiryId
}

/**
 * Create a validated MessageId
 * @throws Error if invalid UUID format
 */
export function MessageId(value: string): MessageId {
    if (!UUID_REGEX.test(value)) {
        throw new Error(`Invalid MessageId format: ${value}. Expected valid UUID.`)
    }
    return value as MessageId
}

/**
 * Create a validated SubscriptionId
 * @throws Error if invalid UUID format
 */
export function SubscriptionId(value: string): SubscriptionId {
    if (!UUID_REGEX.test(value)) {
        throw new Error(`Invalid SubscriptionId format: ${value}. Expected valid UUID.`)
    }
    return value as SubscriptionId
}

/**
 * Create a validated PaymentId
 * @throws Error if invalid UUID format
 */
export function PaymentId(value: string): PaymentId {
    if (!UUID_REGEX.test(value)) {
        throw new Error(`Invalid PaymentId format: ${value}. Expected valid UUID.`)
    }
    return value as PaymentId
}

/**
 * Create a validated NotificationId
 * @throws Error if invalid UUID format
 */
export function NotificationId(value: string): NotificationId {
    if (!UUID_REGEX.test(value)) {
        throw new Error(`Invalid NotificationId format: ${value}. Expected valid UUID.`)
    }
    return value as NotificationId
}

/**
 * Create a validated FavoriteId
 * @throws Error if invalid UUID format
 */
export function FavoriteId(value: string): FavoriteId {
    if (!UUID_REGEX.test(value)) {
        throw new Error(`Invalid FavoriteId format: ${value}. Expected valid UUID.`)
    }
    return value as FavoriteId
}

/**
 * Create a validated BulkImportJobId
 * @throws Error if invalid UUID format
 */
export function BulkImportJobId(value: string): BulkImportJobId {
    if (!UUID_REGEX.test(value)) {
        throw new Error(`Invalid BulkImportJobId format: ${value}. Expected valid UUID.`)
    }
    return value as BulkImportJobId
}

// ============================================================================
// Domain Value Factory Functions
// ============================================================================

/**
 * Create a validated Email
 * @throws Error if invalid email format
 */
export function Email(value: string): Email {
    if (!EMAIL_REGEX.test(value)) {
        throw new Error(`Invalid Email format: ${value}`)
    }
    return value.toLowerCase() as Email
}

/**
 * Create a validated PhoneNumber
 * @throws Error if invalid phone format
 */
export function PhoneNumber(value: string): PhoneNumber {
    const digits = value.replace(/\D/g, '')
    if (!PHONE_REGEX.test(digits)) {
        throw new Error(`Invalid PhoneNumber format: ${value}. Expected 10 digits starting with 6-9.`)
    }
    return digits as PhoneNumber
}

/**
 * Create a validated Pincode
 * @throws Error if invalid pincode format
 */
export function Pincode(value: string): Pincode {
    if (!PINCODE_REGEX.test(value)) {
        throw new Error(`Invalid Pincode format: ${value}. Expected 6 digits.`)
    }
    return value as Pincode
}

/**
 * Create a validated UUID
 * @throws Error if invalid UUID format
 */
export function UUID(value: string): UUID {
    if (!UUID_REGEX.test(value)) {
        throw new Error(`Invalid UUID format: ${value}`)
    }
    return value as UUID
}

/**
 * Create a validated URLString
 * @throws Error if invalid URL format
 */
export function URLString(value: string): URLString {
    if (!URL_REGEX.test(value)) {
        throw new Error(`Invalid URL format: ${value}`)
    }
    return value as URLString
}

/**
 * Create a validated ISO8601Date
 * @throws Error if invalid date format
 */
export function ISO8601Date(value: string): ISO8601Date {
    const date = new Date(value)
    if (isNaN(date.getTime())) {
        throw new Error(`Invalid ISO8601Date format: ${value}`)
    }
    return value as ISO8601Date
}

/**
 * Create a validated CurrencyAmount (in smallest unit, e.g., paise)
 * @throws Error if negative or not an integer
 */
export function CurrencyAmount(value: number): CurrencyAmount {
    if (!Number.isInteger(value)) {
        throw new Error(`CurrencyAmount must be an integer: ${value}`)
    }
    if (value < 0) {
        throw new Error(`CurrencyAmount cannot be negative: ${value}`)
    }
    return value as CurrencyAmount
}

/**
 * Create a validated Percentage (0-100)
 * @throws Error if out of range
 */
export function Percentage(value: number): Percentage {
    if (value < 0 || value > 100) {
        throw new Error(`Percentage must be between 0 and 100: ${value}`)
    }
    return value as Percentage
}

/**
 * Create a validated Latitude (-90 to 90)
 * @throws Error if out of range
 */
export function Latitude(value: number): Latitude {
    if (value < -90 || value > 90) {
        throw new Error(`Latitude must be between -90 and 90: ${value}`)
    }
    return value as Latitude
}

/**
 * Create a validated Longitude (-180 to 180)
 * @throws Error if out of range
 */
export function Longitude(value: number): Longitude {
    if (value < -180 || value > 180) {
        throw new Error(`Longitude must be between -180 and 180: ${value}`)
    }
    return value as Longitude
}

// ============================================================================
// Business Logic Factory Functions
// ============================================================================

/**
 * Create a NonNegativeInteger
 * @throws Error if negative or not an integer
 */
export function NonNegativeInteger(value: number): NonNegativeInteger {
    if (!Number.isInteger(value)) {
        throw new Error(`NonNegativeInteger must be an integer: ${value}`)
    }
    if (value < 0) {
        throw new Error(`NonNegativeInteger cannot be negative: ${value}`)
    }
    return value as NonNegativeInteger
}

/**
 * Create a PositiveInteger
 * @throws Error if not positive or not an integer
 */
export function PositiveInteger(value: number): PositiveInteger {
    if (!Number.isInteger(value)) {
        throw new Error(`PositiveInteger must be an integer: ${value}`)
    }
    if (value <= 0) {
        throw new Error(`PositiveInteger must be positive: ${value}`)
    }
    return value as PositiveInteger
}

// ============================================================================
// Zod Schemas for Branded Types
// ============================================================================

export const UserIdSchema = z.string().uuid().transform(UserId)
export const PropertyIdSchema = z.string().uuid().transform(PropertyId)
export const InquiryIdSchema = z.string().uuid().transform(InquiryId)
export const MessageIdSchema = z.string().uuid().transform(MessageId)
export const SubscriptionIdSchema = z.string().uuid().transform(SubscriptionId)
export const PaymentIdSchema = z.string().uuid().transform(PaymentId)
export const NotificationIdSchema = z.string().uuid().transform(NotificationId)
export const FavoriteIdSchema = z.string().uuid().transform(FavoriteId)
export const BulkImportJobIdSchema = z.string().uuid().transform(BulkImportJobId)

export const EmailSchema = z.string().email().transform(Email)
export const PhoneNumberSchema = z.string().regex(PHONE_REGEX).transform(PhoneNumber)
export const PincodeSchema = z.string().regex(PINCODE_REGEX).transform(Pincode)
export const UUIDSchema = z.string().uuid().transform(UUID)
export const URLStringSchema = z.string().url().transform(URLString)
export const ISO8601DateSchema = z.string().datetime().transform(ISO8601Date)
export const CurrencyAmountSchema = z.number().int().nonnegative().transform(CurrencyAmount)
export const PercentageSchema = z.number().min(0).max(100).transform(Percentage)
export const LatitudeSchema = z.number().min(-90).max(90).transform(Latitude)
export const LongitudeSchema = z.number().min(-180).max(180).transform(Longitude)
export const NonNegativeIntegerSchema = z.number().int().nonnegative().transform(NonNegativeInteger)
export const PositiveIntegerSchema = z.number().int().positive().transform(PositiveInteger)

// ============================================================================
// Type Guards
// ============================================================================

export function isValidUUID(value: unknown): value is string {
    return typeof value === 'string' && UUID_REGEX.test(value)
}

export function isValidEmail(value: unknown): value is string {
    return typeof value === 'string' && EMAIL_REGEX.test(value)
}

export function isValidPhoneNumber(value: unknown): value is string {
    return typeof value === 'string' && PHONE_REGEX.test(value.replace(/\D/g, ''))
}

export function isValidPincode(value: unknown): value is string {
    return typeof value === 'string' && PINCODE_REGEX.test(value)
}

export function isValidURL(value: unknown): value is string {
    return typeof value === 'string' && URL_REGEX.test(value)
}

// ============================================================================
// Safe Parsing Functions (return null instead of throwing)
// ============================================================================

export function safeUserId(value: string): UserId | null {
    try { return UserId(value) } catch { return null }
}

export function safePropertyId(value: string): PropertyId | null {
    try { return PropertyId(value) } catch { return null }
}

export function safeEmail(value: string): Email | null {
    try { return Email(value) } catch { return null }
}

export function safePhoneNumber(value: string): PhoneNumber | null {
    try { return PhoneNumber(value) } catch { return null }
}

export function safePincode(value: string): Pincode | null {
    try { return Pincode(value) } catch { return null }
}

export function safeCurrencyAmount(value: number): CurrencyAmount | null {
    try { return CurrencyAmount(value) } catch { return null }
}

export function safeLatitude(value: number): Latitude | null {
    try { return Latitude(value) } catch { return null }
}

export function safeLongitude(value: number): Longitude | null {
    try { return Longitude(value) } catch { return null }
}
