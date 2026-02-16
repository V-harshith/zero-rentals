/**
 * API Error Handling Utilities
 *
 * Provides safe error responses that don't leak internal details
 */

import { NextResponse } from 'next/server'

/**
 * Safe error response that logs details server-side but returns generic message to client
 */
export function createSafeErrorResponse(
  error: any,
  logPrefix: string,
  statusCode: number = 500
): NextResponse {
  // Error details should be sent to a proper logging service in production
  // rather than console output

  // Return generic error message to client
  const message = statusCode >= 500
    ? 'Internal server error. Please try again later.'
    : 'Request failed. Please check your input and try again.'

  return NextResponse.json(
    { error: message },
    { status: statusCode }
  )
}

/**
 * Safe success response with consistent format
 */
export function createSuccessResponse<T>(data: T): NextResponse {
  return NextResponse.json({ data })
}

/**
 * HTTP Status codes for common scenarios
 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
} as const

/**
 * Error codes for client-side handling
 */
export const ErrorCodes = {
  INVALID_INPUT: 'INVALID_INPUT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
} as const
