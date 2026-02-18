/**
 * Bulk Import System - Password Generation
 *
 * Secure password generation for new owner accounts.
 */

import { DEFAULT_PASSWORD_LENGTH, PASSWORD_CHARS } from './constants'
import { logger } from './logger'

/**
 * Generate a cryptographically secure random password
 *
 * @param length - Password length (default: 12)
 * @returns Generated password string
 */
export function generatePassword(length: number = DEFAULT_PASSWORD_LENGTH): string {
    if (length < 8) {
        logger.warn('Password length too short, using minimum of 8')
        length = 8
    }

    if (length > 32) {
        logger.warn('Password length too long, using maximum of 32')
        length = 32
    }

    const allChars =
        PASSWORD_CHARS.uppercase +
        PASSWORD_CHARS.lowercase +
        PASSWORD_CHARS.numbers +
        PASSWORD_CHARS.symbols

    // Ensure at least one of each character type
    const password: string[] = [
        getRandomChar(PASSWORD_CHARS.uppercase),
        getRandomChar(PASSWORD_CHARS.lowercase),
        getRandomChar(PASSWORD_CHARS.numbers),
        getRandomChar(PASSWORD_CHARS.symbols),
    ]

    // Fill remaining length with random characters
    for (let i = password.length; i < length; i++) {
        password.push(getRandomChar(allChars))
    }

    // Shuffle the password
    return shuffleArray(password).join('')
}

/**
 * Get a random character from a string
 */
function getRandomChar(chars: string): string {
    const randomIndex = cryptoRandomInt(0, chars.length - 1)
    return chars[randomIndex]
}

/**
 * Generate a cryptographically secure random integer
 *
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns Random integer
 */
function cryptoRandomInt(min: number, max: number): number {
    const range = max - min + 1
    const randomBytes = new Uint32Array(1)

    // Use crypto.getRandomValues if available (browser/Node.js)
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(randomBytes)
    } else if (typeof require !== 'undefined') {
        // Node.js fallback
        try {
            const nodeCrypto = require('crypto')
            randomBytes[0] = nodeCrypto.randomInt(0, 0xffffffff)
        } catch {
            // Fallback to Math.random (less secure, but functional)
            randomBytes[0] = Math.floor(Math.random() * 0xffffffff)
        }
    } else {
        // Final fallback (less secure)
        randomBytes[0] = Math.floor(Math.random() * 0xffffffff)
    }

    return min + (randomBytes[0] % range)
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
    const result = [...array]

    for (let i = result.length - 1; i > 0; i--) {
        const j = cryptoRandomInt(0, i)
        ;[result[i], result[j]] = [result[j], result[i]]
    }

    return result
}

/**
 * Validate password strength
 *
 * @param password - Password to validate
 * @returns Validation result
 */
export function validatePasswordStrength(password: string): {
    valid: boolean
    score: number
    errors: string[]
} {
    const errors: string[] = []
    let score = 0

    // Length check
    if (password.length >= 12) {
        score += 2
    } else if (password.length >= 8) {
        score += 1
    } else {
        errors.push('Password must be at least 8 characters')
    }

    // Character variety checks
    if (/[A-Z]/.test(password)) score += 1
    else errors.push('Password must contain uppercase letter')

    if (/[a-z]/.test(password)) score += 1
    else errors.push('Password must contain lowercase letter')

    if (/[0-9]/.test(password)) score += 1
    else errors.push('Password must contain number')

    if (/[^A-Za-z0-9]/.test(password)) score += 1
    else errors.push('Password must contain special character')

    return {
        valid: errors.length === 0,
        score,
        errors,
    }
}

/**
 * Generate multiple unique passwords
 *
 * @param count - Number of passwords to generate
 * @param length - Length of each password
 * @returns Array of unique passwords
 */
export function generateMultiplePasswords(
    count: number,
    length: number = DEFAULT_PASSWORD_LENGTH
): string[] {
    const passwords = new Set<string>()

    while (passwords.size < count) {
        passwords.add(generatePassword(length))
    }

    return Array.from(passwords)
}

/**
 * Generate password with custom options
 */
interface PasswordOptions {
    length?: number
    includeUppercase?: boolean
    includeLowercase?: boolean
    includeNumbers?: boolean
    includeSymbols?: boolean
}

/**
 * Generate a password with custom character set options
 *
 * @param options - Password generation options
 * @returns Generated password
 */
export function generatePasswordWithOptions(
    options: PasswordOptions = {}
): string {
    const {
        length = DEFAULT_PASSWORD_LENGTH,
        includeUppercase = true,
        includeLowercase = true,
        includeNumbers = true,
        includeSymbols = true,
    } = options

    let chars = ''
    const required: string[] = []

    if (includeUppercase) {
        chars += PASSWORD_CHARS.uppercase
        required.push(getRandomChar(PASSWORD_CHARS.uppercase))
    }
    if (includeLowercase) {
        chars += PASSWORD_CHARS.lowercase
        required.push(getRandomChar(PASSWORD_CHARS.lowercase))
    }
    if (includeNumbers) {
        chars += PASSWORD_CHARS.numbers
        required.push(getRandomChar(PASSWORD_CHARS.numbers))
    }
    if (includeSymbols) {
        chars += PASSWORD_CHARS.symbols
        required.push(getRandomChar(PASSWORD_CHARS.symbols))
    }

    if (chars === '') {
        throw new Error('At least one character type must be included')
    }

    const password = [...required]
    for (let i = required.length; i < length; i++) {
        password.push(getRandomChar(chars))
    }

    return shuffleArray(password).join('')
}
