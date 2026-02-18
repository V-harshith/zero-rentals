/**
 * Bulk Import System - Column Mapper
 *
 * Maps Excel column names to standardized property fields.
 */

import { logger } from './logger'

/**
 * Column name variations that map to the same field
 * Backward-compatible format matching original excel/route.ts
 */
export const COLUMN_NAMES = {
    PSN: ['PSN', 'psn'],
    PROPERTY_NAME: ['Property Name', 'title', 'property_name', 'name'],
    EMAIL: ['Email', 'email', 'owner_email'],
    OWNER_NAME: ['Owner Name', 'owner_name', 'ownerName'],
    OWNER_CONTACT: ['Owner Contact', 'owner_contact', 'ownerContact', 'phone'],
    CITY: ['City', 'city'],
    AREA: ['Area', 'area', 'locality'],
    ADDRESS: ['Address', 'address', 'street_address'],
    COUNTRY: ['Country', 'country'],
    LOCALITY: ['Locality', 'locality'],
    LANDMARK: ['Landmark', 'landmark'],
    USP: ['USP', 'usp'],
    FACILITIES: ['Facilities', 'facilities'],
    PROPERTY_TYPE: ['Property Type', 'Property_Type', 'property_type', 'Type', 'type'],
    PG_FOR: ["PG's for", "PG's For", "pg_for", "PGFor"],
    PRIVATE_ROOM: ['Private Room', 'private_room_price'],
    DOUBLE_SHARING: ['Double Sharing', 'double_sharing_price'],
    TRIPLE_SHARING: ['Triple Sharing', 'triple_sharing_price', 'TrippleSharing', 'TripleSharing'],
    FOUR_SHARING: ['Four Sharing', 'four_sharing_price'],
    ONE_RK: ['1RK', 'one_rk_price'],
    DEPOSIT: ['Deposit', 'deposit'],
} as const

/**
 * Type for valid column keys
 */
export type ColumnKey = keyof typeof COLUMN_NAMES

/**
 * Get the standardized column key for a given header
 *
 * @param header - The column header from Excel
 * @returns The standardized key or null if not found
 */
export function getColumnKey(header: string): ColumnKey | null {
    const normalized = header.trim().toLowerCase()

    for (const [key, variations] of Object.entries(COLUMN_NAMES)) {
        for (const variation of variations) {
            if (variation.toLowerCase() === normalized) {
                return key as ColumnKey
            }
        }
    }

    return null
}

/**
 * Get the value for a column from a row using flexible column matching
 *
 * @param row - The row object from Excel
 * @param possibleNames - Array of possible column names to try
 * @returns The value or undefined if not found
 */
export function getColumnValue(
    row: Record<string, unknown>,
    possibleNames: readonly string[]
): unknown {
    // Try exact match first
    for (const name of possibleNames) {
        if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
            return row[name]
        }
    }

    // Try case-insensitive match
    const rowKeys = Object.keys(row)
    for (const name of possibleNames) {
        const match = rowKeys.find(
            (key) => key.toLowerCase() === name.toLowerCase()
        )
        if (match) {
            return row[match]
        }
    }

    return undefined
}

/**
 * Build a column mapping from Excel headers
 *
 * @param headers - Array of column headers from Excel
 * @returns Map of standardized keys to original headers
 */
export function buildColumnMapping(headers: string[]): Map<ColumnKey, string> {
    const mapping = new Map<ColumnKey, string>()
    const unmatched: string[] = []

    for (const header of headers) {
        const key = getColumnKey(header)
        if (key) {
            mapping.set(key, header)
        } else {
            unmatched.push(header)
        }
    }

    if (unmatched.length > 0) {
        logger.warn('Unmatched columns', { unmatched })
    }

    return mapping
}

/**
 * Required columns for a valid import
 */
export const REQUIRED_COLUMNS: ColumnKey[] = [
    'PSN',
    'PROPERTY_NAME',
    'EMAIL',
    'PROPERTY_TYPE',
    'CITY',
]

/**
 * Validate that all required columns are present
 *
 * @param headers - Array of column headers from Excel
 * @returns Object with missing and present columns
 */
export function validateRequiredColumns(
    headers: string[]
): { missing: ColumnKey[]; present: ColumnKey[] } {
    const mapping = buildColumnMapping(headers)
    const present = Array.from(mapping.keys())
    const missing = REQUIRED_COLUMNS.filter((col) => !mapping.has(col))

    return { missing, present }
}

/**
 * Get all possible column headers (for template generation)
 *
 * @returns Array of all known column headers
 */
export function getAllColumnHeaders(): string[] {
    const headers = new Set<string>()

    for (const variations of Object.values(COLUMN_NAMES)) {
        for (const variation of variations) {
            headers.add(variation)
        }
    }

    return Array.from(headers).sort()
}

/**
 * Get the primary column header for a field (recommended name)
 *
 * @param field - The standardized field name
 * @returns The recommended column header
 */
export function getPrimaryHeader(field: ColumnKey): string {
    const variations = COLUMN_NAMES[field]
    return variations ? variations[0] : field
}

/**
 * Create a template row with example data
 *
 * @returns Example row object
 */
export function createTemplateRow(): Record<string, string> {
    return {
        PSN: 'PSN001',
        'Property Name': 'Sunshine PG',
        'Owner Email': 'owner@example.com',
        'Owner Name': 'John Doe',
        'Owner Phone': '9876543210',
        'Property Type': 'PG',
        'Room Type': 'Shared',
        City: 'Bangalore',
        Area: 'Koramangala',
        Locality: '5th Block',
        Address: '123 Main Street',
        Landmark: 'Near Metro Station',
        'Google Maps URL': 'https://maps.google.com/...',
        '1RK Price': '8000',
        'Private Room Price': '12000',
        'Double Sharing Price': '7000',
        'Triple Sharing Price': '6000',
        'Four Sharing Price': '5000',
        Deposit: '20000',
        Amenities: 'WiFi, AC, TV, Fridge',
        'Preferred Tenant': 'Male',
        USP: 'Premium location with modern amenities',
        Laundry: 'Yes',
        'Room Cleaning': 'Yes',
        Warden: 'Yes',
        Parking: 'Bike',
    }
}
