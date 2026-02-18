/**
 * Utilities Index
 *
 * Central export for all utility functions.
 */

// Runtime Assertions
export {
    // Core assertions
    assertDefined,
    assertNotNull,
    assertNotUndefined,

    // Type assertions
    assertString,
    assertNumber,
    assertBoolean,
    assertArray,
    assertObject,
    assertFunction,

    // Range assertions
    assertPositive,
    assertNonNegative,
    assertInRange,
    assertInteger,

    // String assertions
    assertNotEmpty,
    assertMatches,
    assertMinLength,
    assertMaxLength,

    // Collection assertions
    assertNotEmptyArray,
    assertArrayMinLength,
    assertArrayMaxLength,
    assertUnique,

    // Enum/Union assertions
    assertOneOf,
    assertUUID,
    assertEmail,
    assertURL,

    // Object assertions
    assertHasProperty,
    assertHasProperties,
    assertEquals,
    assertNotEquals,

    // Business logic assertions
    assertValidPropertyType,
    assertValidRoomType,
    assertValidPropertyStatus,
    assertValidUserRole,
    assertValidCoordinates,
    assertValidPrice,
    assertValidPincode,
    assertValidPhone,

    // Async assertions
    assertResolves,
    assertRejects,

    // Development-only assertions
    devAssert,
    devWarn,

    // Combinators
    assertAll,
    assertAny,

    // Error class
    AssertionError,
} from './runtime-assertions'

// Error Logger
export {
    // Main classes
    ErrorLogger,

    // Factory functions
    createErrorLogger,
    createAPIErrorLogger,

    // Global logger
    getGlobalLogger,
    setGlobalLogger,
    logError,

    // Helpers
    withErrorLogging,
    logErrorBoundary,

    // Types
    type ErrorSeverity,
    type ErrorContext,
    type ErrorLogEntry,
    type ErrorLoggerConfig,
    type ErrorHandler,
    type NextJSErrorContext,
    type ErrorBoundaryLogParams,
} from './error-logger'
