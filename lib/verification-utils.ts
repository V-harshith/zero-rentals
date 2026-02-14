import crypto from 'crypto'

/**
 * Generate a secure random verification token
 */
export function generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex')
}

/**
 * Get token expiry time (24 hours from now)
 */
export function getTokenExpiry(): Date {
    const expiry = new Date()
    expiry.setHours(expiry.getHours() + 24) // 24 hours
    return expiry
}

/**
 * Check if a token has expired
 */
export function isTokenExpired(expiresAt: string | Date): boolean {
    return new Date(expiresAt) < new Date()
}

/**
 * Generate a secure token with custom length
 */
export function generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex')
}
