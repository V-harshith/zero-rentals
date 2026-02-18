/**
 * Runtime Assertions Module
 *
 * Provides comprehensive runtime assertion utilities for defensive programming.
 * All assertions include detailed error messages and context logging.
 *
 * @example
 * assertDefined(user, 'User must be defined')
 * assertPositive(price, 'Price must be positive')
 * assertValidEnum(status, ['active', 'inactive'], 'Invalid status')
 */

import { createErrorLogger, ErrorSeverity } from './error-logger'

const logger = createErrorLogger('RuntimeAssertion')

// ============================================================================
// Assertion Error Class
// ============================================================================

export class AssertionError extends Error {
    readonly code: string
    readonly context: Record<string, unknown>
    readonly timestamp: string
    readonly severity: ErrorSeverity

    constructor(
        message: string,
        code: string,
        context: Record<string, unknown> = {},
        severity: ErrorSeverity = 'error'
    ) {
        super(message)
        this.name = 'AssertionError'
        this.code = code
        this.context = context
        this.timestamp = new Date().toISOString()
        this.severity = severity

        // Log the assertion failure
        logger.log({
            code,
            message,
            severity,
            context,
            stack: this.stack,
        })
    }
}

// ============================================================================
// Basic Existence Assertions
// ============================================================================

/**
 * Assert that a value is defined (not null or undefined)
 * @throws AssertionError if value is null or undefined
 */
export function assertDefined<T>(
    value: T | null | undefined,
    message: string,
    context: Record<string, unknown> = {}
): asserts value is T {
    if (value === null) {
        throw new AssertionError(
            message || 'Expected value to be non-null',
            'ASSERT_NULL_ERROR',
            { ...context, actualValue: null }
        )
    }
    if (value === undefined) {
        throw new AssertionError(
            message || 'Expected value to be defined',
            'ASSERT_UNDEFINED_ERROR',
            { ...context, actualValue: undefined }
        )
    }
}

/**
 * Assert that a value is not null
 * @throws AssertionError if value is null
 */
export function assertNotNull<T>(
    value: T | null,
    message: string,
    context: Record<string, unknown> = {}
): asserts value is T {
    if (value === null) {
        throw new AssertionError(
            message || 'Expected value to be non-null',
            'ASSERT_NULL_ERROR',
            { ...context, actualValue: null }
        )
    }
}

/**
 * Assert that a value is not undefined
 * @throws AssertionError if value is undefined
 */
export function assertNotUndefined<T>(
    value: T | undefined,
    message: string,
    context: Record<string, unknown> = {}
): asserts value is T {
    if (value === undefined) {
        throw new AssertionError(
            message || 'Expected value to be defined',
            'ASSERT_UNDEFINED_ERROR',
            { ...context, actualValue: undefined }
        )
    }
}

// ============================================================================
// Type Assertions
// ============================================================================

/**
 * Assert that a value is a string
 * @throws AssertionError if value is not a string
 */
export function assertString(
    value: unknown,
    message: string,
    context: Record<string, unknown> = {}
): asserts value is string {
    if (typeof value !== 'string') {
        throw new AssertionError(
            message || `Expected string, got ${typeof value}`,
            'ASSERT_TYPE_ERROR',
            { ...context, expectedType: 'string', actualType: typeof value, actualValue: value }
        )
    }
}

/**
 * Assert that a value is a number
 * @throws AssertionError if value is not a number
 */
export function assertNumber(
    value: unknown,
    message: string,
    context: Record<string, unknown> = {}
): asserts value is number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new AssertionError(
            message || `Expected number, got ${typeof value}`,
            'ASSERT_TYPE_ERROR',
            { ...context, expectedType: 'number', actualType: typeof value, actualValue: value }
        )
    }
}

/**
 * Assert that a value is a boolean
 * @throws AssertionError if value is not a boolean
 */
export function assertBoolean(
    value: unknown,
    message: string,
    context: Record<string, unknown> = {}
): asserts value is boolean {
    if (typeof value !== 'boolean') {
        throw new AssertionError(
            message || `Expected boolean, got ${typeof value}`,
            'ASSERT_TYPE_ERROR',
            { ...context, expectedType: 'boolean', actualType: typeof value, actualValue: value }
        )
    }
}

/**
 * Assert that a value is an array
 * @throws AssertionError if value is not an array
 */
export function assertArray<T>(
    value: unknown,
    message: string,
    context: Record<string, unknown> = {}
): asserts value is T[] {
    if (!Array.isArray(value)) {
        throw new AssertionError(
            message || `Expected array, got ${typeof value}`,
            'ASSERT_TYPE_ERROR',
            { ...context, expectedType: 'array', actualType: typeof value, actualValue: value }
        )
    }
}

/**
 * Assert that a value is an object (not null, not array)
 * @throws AssertionError if value is not a plain object
 */
export function assertObject(
    value: unknown,
    message: string,
    context: Record<string, unknown> = {}
): asserts value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new AssertionError(
            message || `Expected object, got ${typeof value}`,
            'ASSERT_TYPE_ERROR',
            { ...context, expectedType: 'object', actualType: typeof value, actualValue: value }
        )
    }
}

/**
 * Assert that a value is a function
 * @throws AssertionError if value is not a function
 */
export function assertFunction(
    value: unknown,
    message: string,
    context: Record<string, unknown> = {}
): asserts value is Function {
    if (typeof value !== 'function') {
        throw new AssertionError(
            message || `Expected function, got ${typeof value}`,
            'ASSERT_TYPE_ERROR',
            { ...context, expectedType: 'function', actualType: typeof value }
        )
    }
}

// ============================================================================
// Number Range Assertions
// ============================================================================

/**
 * Assert that a number is positive (> 0)
 * @throws AssertionError if value is not positive
 */
export function assertPositive(
    value: number,
    message: string,
    context: Record<string, unknown> = {}
): void {
    if (!Number.isFinite(value) || value <= 0) {
        throw new AssertionError(
            message || `Expected positive number, got ${value}`,
            'ASSERT_RANGE_ERROR',
            { ...context, expectedRange: '> 0', actualValue: value }
        )
    }
}

/**
 * Assert that a number is non-negative (>= 0)
 * @throws AssertionError if value is negative
 */
export function assertNonNegative(
    value: number,
    message: string,
    context: Record<string, unknown> = {}
): void {
    if (!Number.isFinite(value) || value < 0) {
        throw new AssertionError(
            message || `Expected non-negative number, got ${value}`,
            'ASSERT_RANGE_ERROR',
            { ...context, expectedRange: '>= 0', actualValue: value }
        )
    }
}

/**
 * Assert that a number is within a range [min, max]
 * @throws AssertionError if value is outside range
 */
export function assertInRange(
    value: number,
    min: number,
    max: number,
    message: string,
    context: Record<string, unknown> = {}
): void {
    if (!Number.isFinite(value) || value < min || value > max) {
        throw new AssertionError(
            message || `Expected number in range [${min}, ${max}], got ${value}`,
            'ASSERT_RANGE_ERROR',
            { ...context, expectedRange: `[${min}, ${max}]`, actualValue: value }
        )
    }
}

/**
 * Assert that a number is an integer
 * @throws AssertionError if value is not an integer
 */
export function assertInteger(
    value: number,
    message: string,
    context: Record<string, unknown> = {}
): void {
    if (!Number.isInteger(value)) {
        throw new AssertionError(
            message || `Expected integer, got ${value}`,
            'ASSERT_TYPE_ERROR',
            { ...context, expectedType: 'integer', actualValue: value }
        )
    }
}

// ============================================================================
// String Assertions
// ============================================================================

/**
 * Assert that a string is not empty
 * @throws AssertionError if string is empty
 */
export function assertNotEmpty(
    value: string,
    message: string,
    context: Record<string, unknown> = {}
): void {
    if (value.length === 0) {
        throw new AssertionError(
            message || 'Expected non-empty string',
            'ASSERT_EMPTY_ERROR',
            { ...context, actualValue: value }
        )
    }
}

/**
 * Assert that a string matches a regex pattern
 * @throws AssertionError if string doesn't match pattern
 */
export function assertMatches(
    value: string,
    pattern: RegExp,
    message: string,
    context: Record<string, unknown> = {}
): void {
    if (!pattern.test(value)) {
        throw new AssertionError(
            message || `String does not match pattern ${pattern}`,
            'ASSERT_PATTERN_ERROR',
            { ...context, pattern: pattern.toString(), actualValue: value }
        )
    }
}

/**
 * Assert that a string has a minimum length
 * @throws AssertionError if string is too short
 */
export function assertMinLength(
    value: string,
    minLength: number,
    message: string,
    context: Record<string, unknown> = {}
): void {
    if (value.length < minLength) {
        throw new AssertionError(
            message || `Expected string with at least ${minLength} characters, got ${value.length}`,
            'ASSERT_LENGTH_ERROR',
            { ...context, minLength, actualLength: value.length, actualValue: value }
        )
    }
}

/**
 * Assert that a string has a maximum length
 * @throws AssertionError if string is too long
 */
export function assertMaxLength(
    value: string,
    maxLength: number,
    message: string,
    context: Record<string, unknown> = {}
): void {
    if (value.length > maxLength) {
        throw new AssertionError(
            message || `Expected string with at most ${maxLength} characters, got ${value.length}`,
            'ASSERT_LENGTH_ERROR',
            { ...context, maxLength, actualLength: value.length }
        )
    }
}

// ============================================================================
// Collection Assertions
// ============================================================================

/**
 * Assert that an array is not empty
 * @throws AssertionError if array is empty
 */
export function assertNotEmptyArray<T>(
    value: T[],
    message: string,
    context: Record<string, unknown> = {}
): void {
    if (value.length === 0) {
        throw new AssertionError(
            message || 'Expected non-empty array',
            'ASSERT_EMPTY_ERROR',
            { ...context, actualLength: 0 }
        )
    }
}

/**
 * Assert that an array has a minimum length
 * @throws AssertionError if array is too short
 */
export function assertArrayMinLength<T>(
    value: T[],
    minLength: number,
    message: string,
    context: Record<string, unknown> = {}
): void {
    if (value.length < minLength) {
        throw new AssertionError(
            message || `Expected array with at least ${minLength} elements, got ${value.length}`,
            'ASSERT_LENGTH_ERROR',
            { ...context, minLength, actualLength: value.length }
        )
    }
}

/**
 * Assert that an array has a maximum length
 * @throws AssertionError if array is too long
 */
export function assertArrayMaxLength<T>(
    value: T[],
    maxLength: number,
    message: string,
    context: Record<string, unknown> = {}
): void {
    if (value.length > maxLength) {
        throw new AssertionError(
            message || `Expected array with at most ${maxLength} elements, got ${value.length}`,
            'ASSERT_LENGTH_ERROR',
            { ...context, maxLength, actualLength: value.length }
        )
    }
}

/**
 * Assert that an array has unique elements
 * @throws AssertionError if array has duplicates
 */
export function assertUnique<T>(
    value: T[],
    message: string,
    context: Record<string, unknown> = {}
): void {
    const seen = new Set<T>()
    const duplicates: T[] = []

    for (const item of value) {
        if (seen.has(item)) {
            duplicates.push(item)
        }
        seen.add(item)
    }

    if (duplicates.length > 0) {
        throw new AssertionError(
            message || 'Expected array with unique elements',
            'ASSERT_UNIQUE_ERROR',
            { ...context, duplicates }
        )
    }
}

// ============================================================================
// Enum and Union Assertions
// ============================================================================

/**
 * Assert that a value is one of the allowed values
 * @throws AssertionError if value is not in allowed values
 */
export function assertOneOf<T extends string | number>(
    value: unknown,
    allowedValues: readonly T[],
    message: string,
    context: Record<string, unknown> = {}
): asserts value is T {
    if (!allowedValues.includes(value as T)) {
        throw new AssertionError(
            message || `Expected one of [${allowedValues.join(', ')}], got ${value}`,
            'ASSERT_ENUM_ERROR',
            { ...context, allowedValues, actualValue: value }
        )
    }
}

/**
 * Assert that a value is a valid UUID
 * @throws AssertionError if value is not a valid UUID
 */
export function assertUUID(
    value: string,
    message: string,
    context: Record<string, unknown> = {}
): void {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!UUID_REGEX.test(value)) {
        throw new AssertionError(
            message || `Invalid UUID format: ${value}`,
            'ASSERT_FORMAT_ERROR',
            { ...context, expectedFormat: 'UUID', actualValue: value }
        )
    }
}

/**
 * Assert that a value is a valid email
 * @throws AssertionError if value is not a valid email
 */
export function assertEmail(
    value: string,
    message: string,
    context: Record<string, unknown> = {}
): void {
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!EMAIL_REGEX.test(value)) {
        throw new AssertionError(
            message || `Invalid email format: ${value}`,
            'ASSERT_FORMAT_ERROR',
            { ...context, expectedFormat: 'email', actualValue: value }
        )
    }
}

/**
 * Assert that a value is a valid URL
 * @throws AssertionError if value is not a valid URL
 */
export function assertURL(
    value: string,
    message: string,
    context: Record<string, unknown> = {}
): void {
    try {
        new URL(value)
    } catch {
        throw new AssertionError(
            message || `Invalid URL format: ${value}`,
            'ASSERT_FORMAT_ERROR',
            { ...context, expectedFormat: 'URL', actualValue: value }
        )
    }
}

// ============================================================================
// Object Assertions
// ============================================================================

/**
 * Assert that an object has a specific property
 * @throws AssertionError if property is missing
 */
export function assertHasProperty<K extends string>(
    obj: object,
    key: K,
    message: string,
    context: Record<string, unknown> = {}
): asserts obj is Record<K, unknown> {
    if (!(key in obj)) {
        throw new AssertionError(
            message || `Expected object to have property '${key}'`,
            'ASSERT_PROPERTY_ERROR',
            { ...context, expectedProperty: key, actualKeys: Object.keys(obj) }
        )
    }
}

/**
 * Assert that an object has all specified properties
 * @throws AssertionError if any property is missing
 */
export function assertHasProperties<K extends string>(
    obj: object,
    keys: readonly K[],
    message: string,
    context: Record<string, unknown> = {}
): asserts obj is Record<K, unknown> {
    const missing = keys.filter(key => !(key in obj))
    if (missing.length > 0) {
        throw new AssertionError(
            message || `Expected object to have properties: ${missing.join(', ')}`,
            'ASSERT_PROPERTY_ERROR',
            { ...context, missingProperties: missing, actualKeys: Object.keys(obj) }
        )
    }
}

/**
 * Assert that two values are equal (deep equality for objects)
 * @throws AssertionError if values are not equal
 */
export function assertEquals<T>(
    actual: T,
    expected: T,
    message: string,
    context: Record<string, unknown> = {}
): void {
    const actualJson = JSON.stringify(actual)
    const expectedJson = JSON.stringify(expected)
    if (actualJson !== expectedJson) {
        throw new AssertionError(
            message || `Expected ${expectedJson}, got ${actualJson}`,
            'ASSERT_EQUALITY_ERROR',
            { ...context, expected, actual }
        )
    }
}

/**
 * Assert that two values are not equal
 * @throws AssertionError if values are equal
 */
export function assertNotEquals<T>(
    actual: T,
    notExpected: T,
    message: string,
    context: Record<string, unknown> = {}
): void {
    const actualJson = JSON.stringify(actual)
    const notExpectedJson = JSON.stringify(notExpected)
    if (actualJson === notExpectedJson) {
        throw new AssertionError(
            message || `Expected values to be different, both were ${actualJson}`,
            'ASSERT_INEQUALITY_ERROR',
            { ...context, notExpected, actual }
        )
    }
}

// ============================================================================
// Business Logic Assertions
// ============================================================================

/**
 * Assert that a property type is valid
 * @throws AssertionError if property type is invalid
 */
export function assertValidPropertyType(
    value: string,
    message: string = 'Invalid property type',
    context: Record<string, unknown> = {}
): void {
    const validTypes = ['PG', 'Co-living', 'Rent'] as const
    assertOneOf(value, validTypes, message, context)
}

/**
 * Assert that a room type is valid
 * @throws AssertionError if room type is invalid
 */
export function assertValidRoomType(
    value: string,
    message: string = 'Invalid room type',
    context: Record<string, unknown> = {}
): void {
    const validTypes = ['Single', 'Double', 'Triple', 'Four Sharing', 'Apartment', '1RK'] as const
    assertOneOf(value, validTypes, message, context)
}

/**
 * Assert that a property status is valid
 * @throws AssertionError if status is invalid
 */
export function assertValidPropertyStatus(
    value: string,
    message: string = 'Invalid property status',
    context: Record<string, unknown> = {}
): void {
    const validStatuses = ['active', 'inactive', 'pending', 'rejected'] as const
    assertOneOf(value, validStatuses, message, context)
}

/**
 * Assert that a user role is valid
 * @throws AssertionError if role is invalid
 */
export function assertValidUserRole(
    value: string,
    message: string = 'Invalid user role',
    context: Record<string, unknown> = {}
): void {
    const validRoles = ['admin', 'owner', 'tenant'] as const
    assertOneOf(value, validRoles, message, context)
}

/**
 * Assert that coordinates are valid
 * @throws AssertionError if coordinates are invalid
 */
export function assertValidCoordinates(
    latitude: number,
    longitude: number,
    message: string = 'Invalid coordinates',
    context: Record<string, unknown> = {}
): void {
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        throw new AssertionError(
            message,
            'ASSERT_COORDINATES_ERROR',
            { ...context, latitude, longitude }
        )
    }
}

/**
 * Assert that a price is valid (positive integer, max 10M)
 * @throws AssertionError if price is invalid
 */
export function assertValidPrice(
    value: number,
    message: string = 'Invalid price',
    context: Record<string, unknown> = {}
): void {
    assertInteger(value, `${message}: must be an integer`, context)
    assertPositive(value, `${message}: must be positive`, context)
    assertInRange(value, 1, 10000000, `${message}: exceeds maximum allowed`, context)
}

/**
 * Assert that a pincode is valid (6 digits)
 * @throws AssertionError if pincode is invalid
 */
export function assertValidPincode(
    value: string,
    message: string = 'Invalid pincode',
    context: Record<string, unknown> = {}
): void {
    const PINCODE_REGEX = /^\d{6}$/
    if (!PINCODE_REGEX.test(value)) {
        throw new AssertionError(
            message,
            'ASSERT_PINCODE_ERROR',
            { ...context, expectedFormat: '6 digits', actualValue: value }
        )
    }
}

/**
 * Assert that a phone number is valid (10 digits, starts with 6-9)
 * @throws AssertionError if phone is invalid
 */
export function assertValidPhone(
    value: string,
    message: string = 'Invalid phone number',
    context: Record<string, unknown> = {}
): void {
    const PHONE_REGEX = /^[6-9]\d{9}$/
    const digits = value.replace(/\D/g, '')
    if (!PHONE_REGEX.test(digits)) {
        throw new AssertionError(
            message,
            'ASSERT_PHONE_ERROR',
            { ...context, expectedFormat: '10 digits starting with 6-9', actualValue: value }
        )
    }
}

// ============================================================================
// Async Assertions
// ============================================================================

/**
 * Assert that a promise resolves successfully
 * @throws AssertionError if promise rejects
 */
export async function assertResolves<T>(
    promise: Promise<T>,
    message: string,
    context: Record<string, unknown> = {}
): Promise<T> {
    try {
        return await promise
    } catch (error) {
        throw new AssertionError(
            message || 'Expected promise to resolve, but it rejected',
            'ASSERT_RESOLVE_ERROR',
            { ...context, error }
        )
    }
}

/**
 * Assert that a promise rejects
 * @throws AssertionError if promise resolves
 */
export async function assertRejects<T>(
    promise: Promise<T>,
    message: string,
    context: Record<string, unknown> = {}
): Promise<unknown> {
    try {
        await promise
        throw new AssertionError(
            message || 'Expected promise to reject, but it resolved',
            'ASSERT_REJECT_ERROR',
            context
        )
    } catch (error) {
        if (error instanceof AssertionError) {
            throw error
        }
        return error
    }
}

// ============================================================================
// Development-Only Assertions (stripped in production)
// ============================================================================

const isDev = process.env.NODE_ENV === 'development'

/**
 * Assert only in development mode (no-op in production)
 */
export function devAssert(
    condition: boolean,
    message: string,
    context: Record<string, unknown> = {}
): void {
    if (isDev && !condition) {
        throw new AssertionError(
            message,
            'DEV_ASSERT_ERROR',
            context,
            'warning'
        )
    }
}

/**
 * Warn only in development mode (console warning, no throw)
 */
export function devWarn(
    condition: boolean,
    message: string,
    context: Record<string, unknown> = {}
): void {
    if (isDev && !condition) {
        console.warn(`[DEV WARN] ${message}`, context)
    }
}

// ============================================================================
// Assertion Combinators
// ============================================================================

/**
 * Assert all conditions are true
 * @throws AssertionError if any condition is false
 */
export function assertAll(
    conditions: { condition: boolean; message: string; context?: Record<string, unknown> }[],
    overallMessage: string = 'Multiple assertions failed'
): void {
    const failures = conditions
        .filter(c => !c.condition)
        .map(c => ({ message: c.message, context: c.context || {} }))

    if (failures.length > 0) {
        throw new AssertionError(
            overallMessage,
            'ASSERT_COMPOUND_ERROR',
            { failures }
        )
    }
}

/**
 * Assert at least one condition is true
 * @throws AssertionError if all conditions are false
 */
export function assertAny(
    conditions: { condition: boolean; message: string }[],
    overallMessage: string = 'At least one condition must be true'
): void {
    const hasTrue = conditions.some(c => c.condition)
    if (!hasTrue) {
        throw new AssertionError(
            overallMessage,
            'ASSERT_COMPOUND_ERROR',
            { failedConditions: conditions.map(c => c.message) }
        )
    }
}
