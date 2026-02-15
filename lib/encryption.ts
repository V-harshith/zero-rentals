import crypto from 'crypto'

/**
 * Encryption utilities for secure credential storage
 * Uses AES-256-GCM for authenticated encryption
 */

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const SALT_LENGTH = 64
const KEY_LENGTH = 32
const ITERATIONS = 100000

/**
 * Derive encryption key from password and salt using PBKDF2
 */
function deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256')
}

/**
 * Encrypt text using AES-256-GCM
 * Format: salt:iv:authTag:ciphertext (all hex encoded)
 */
export function encrypt(text: string, password?: string): string {
    const encryptionPassword = password || process.env.CREDENTIALS_ENCRYPTION_KEY

    if (!encryptionPassword) {
        throw new Error('Encryption key not configured. Set CREDENTIALS_ENCRYPTION_KEY environment variable.')
    }

    // Generate salt and derive key
    const salt = crypto.randomBytes(SALT_LENGTH)
    const key = deriveKey(encryptionPassword, salt)

    // Generate IV
    const iv = crypto.randomBytes(IV_LENGTH)

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    // Encrypt
    const encrypted = Buffer.concat([
        cipher.update(text, 'utf8'),
        cipher.final()
    ])

    // Get auth tag
    const authTag = cipher.getAuthTag()

    // Combine: salt:iv:authTag:ciphertext
    return [
        salt.toString('hex'),
        iv.toString('hex'),
        authTag.toString('hex'),
        encrypted.toString('hex')
    ].join(':')
}

/**
 * Decrypt text using AES-256-GCM
 * Expected format: salt:iv:authTag:ciphertext (all hex encoded)
 */
export function decrypt(encryptedData: string, password?: string): string {
    const encryptionPassword = password || process.env.CREDENTIALS_ENCRYPTION_KEY

    if (!encryptionPassword) {
        throw new Error('Encryption key not configured. Set CREDENTIALS_ENCRYPTION_KEY environment variable.')
    }

    // Split components
    const parts = encryptedData.split(':')
    if (parts.length !== 4) {
        throw new Error('Invalid encrypted data format')
    }

    const [saltHex, ivHex, authTagHex, ciphertextHex] = parts

    // Decode hex
    const salt = Buffer.from(saltHex, 'hex')
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    const ciphertext = Buffer.from(ciphertextHex, 'hex')

    // Derive key
    const key = deriveKey(encryptionPassword, salt)

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    // Decrypt
    const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
    ])

    return decrypted.toString('utf8')
}

/**
 * Check if encryption key is configured
 */
export function isEncryptionConfigured(): boolean {
    return !!process.env.CREDENTIALS_ENCRYPTION_KEY
}

/**
 * Generate a secure encryption key (for admin use)
 */
export function generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('hex')
}

/**
 * Fallback to base64 for backwards compatibility (deprecated)
 * This allows reading old data while new data uses proper encryption
 */
export function decryptLegacy(encryptedData: string): string | null {
    try {
        // Try to decrypt as new format first
        return decrypt(encryptedData)
    } catch {
        // If that fails, try base64 (legacy format)
        try {
            const decoded = Buffer.from(encryptedData, 'base64').toString()
            // Verify it looks like JSON (basic check)
            if (decoded.startsWith('[') || decoded.startsWith('{')) {
                return decoded
            }
        } catch {
            // Not base64 either
        }
        return null
    }
}
