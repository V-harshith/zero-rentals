/**
 * Bulk Import System - Amenity Mapper
 *
 * Maps Excel amenity values to standardized database values.
 */

import { logger } from './logger'

/**
 * Mapping of Excel amenity names to standardized database values
 */
export const AMENITY_MAP: Record<string, string> = {
    // WiFi variants
    'wifi': 'WiFi',
    'wi-fi': 'WiFi',
    'internet': 'WiFi',
    'broadband': 'WiFi',

    // AC variants
    'ac': 'AC',
    'air conditioning': 'AC',
    'airconditioning': 'AC',
    'cooler': 'AC',

    // TV variants
    'tv': 'TV',
    'television': 'TV',
    'cable tv': 'TV',
    'dth': 'TV',

    // Fridge variants
    'fridge': 'Fridge',
    'refrigerator': 'Fridge',

    // Washing Machine variants
    'washing machine': 'Washing Machine',
    'washer': 'Washing Machine',
    'laundry machine': 'Washing Machine',

    // Geyser/Heater variants
    'geyser': 'Geyser',
    'water heater': 'Geyser',
    'heater': 'Geyser',
    'hot water': 'Geyser',

    // Power Backup variants
    'power backup': 'Power Backup',
    'inverter': 'Power Backup',
    'ups': 'Power Backup',
    'generator': 'Power Backup',

    // Security variants
    'security': 'Security',
    'guard': 'Security',
    'cctv': 'Security',
    'surveillance': 'Security',

    // Lift/Elevator variants
    'lift': 'Lift',
    'elevator': 'Lift',

    // Parking variants
    'parking': 'Parking',
    'car parking': 'Parking',
    'bike parking': 'Parking',
    'vehicle parking': 'Parking',

    // Gym variants
    'gym': 'Gym',
    'fitness center': 'Gym',
    'fitness': 'Gym',
    'workout': 'Gym',

    // Swimming Pool variants
    'swimming pool': 'Swimming Pool',
    'pool': 'Swimming Pool',

    // Garden/Park variants
    'garden': 'Garden',
    'park': 'Garden',
    'terrace garden': 'Garden',
    'lawn': 'Garden',

    // Club House variants
    'club house': 'Club House',
    'clubhouse': 'Club House',
    'community hall': 'Club House',
    'party hall': 'Club House',

    // Indoor Games variants
    'indoor games': 'Indoor Games',
    'games room': 'Indoor Games',
    'recreation': 'Indoor Games',

    // Running Track variants
    'running track': 'Running Track',
    'jogging track': 'Running Track',
    'walking track': 'Running Track',

    // Library variants
    'library': 'Library',
    'reading room': 'Library',
    'study room': 'Library',

    // Cafeteria variants
    'cafeteria': 'Cafeteria',
    'canteen': 'Cafeteria',
    'food court': 'Cafeteria',
    'mess': 'Cafeteria',

    // Housekeeping variants
    'housekeeping': 'Housekeeping',
    'cleaning': 'Housekeeping',
    'maid service': 'Housekeeping',

    // Maintenance variants
    'maintenance': 'Maintenance',
    'repair': 'Maintenance',

    // RO Water variants
    'ro water': 'RO Water',
    'ro': 'RO Water',
    'purified water': 'RO Water',
    'water purifier': 'RO Water',

    // Gas Pipeline variants
    'gas pipeline': 'Gas Pipeline',
    'cooking gas': 'Gas Pipeline',
    'png': 'Gas Pipeline',

    // Intercom variants
    'intercom': 'Intercom',
    'intercom facility': 'Intercom',

    // Fire Safety variants
    'fire safety': 'Fire Safety',
    'fire extinguisher': 'Fire Safety',
    'fire alarm': 'Fire Safety',

    // Rain Water Harvesting variants
    'rain water harvesting': 'Rain Water Harvesting',
    'rainwater harvesting': 'Rain Water Harvesting',
    'water harvesting': 'Rain Water Harvesting',

    // Solar Power variants
    'solar power': 'Solar Power',
    'solar': 'Solar Power',
    'solar panels': 'Solar Power',
}

/**
 * Valid amenities in the database
 */
export const VALID_AMENITIES = [
    'WiFi',
    'AC',
    'TV',
    'Fridge',
    'Washing Machine',
    'Geyser',
    'Power Backup',
    'Security',
    'Lift',
    'Parking',
    'Gym',
    'Swimming Pool',
    'Garden',
    'Club House',
    'Indoor Games',
    'Running Track',
    'Library',
    'Cafeteria',
    'Housekeeping',
    'Maintenance',
    'RO Water',
    'Gas Pipeline',
    'Intercom',
    'Fire Safety',
    'Rain Water Harvesting',
    'Solar Power',
]

/**
 * Map a raw amenity string to standardized database value
 */
function mapSingleAmenity(rawAmenity: string): string | null {
    const normalized = rawAmenity.toLowerCase().trim()

    // Direct lookup in map
    if (AMENITY_MAP[normalized]) {
        return AMENITY_MAP[normalized]
    }

    // Check if it's already a valid amenity (case-insensitive)
    const existingMatch = VALID_AMENITIES.find(
        (a) => a.toLowerCase() === normalized
    )
    if (existingMatch) {
        return existingMatch
    }

    // Partial match check
    for (const [key, value] of Object.entries(AMENITY_MAP)) {
        if (normalized.includes(key) || key.includes(normalized)) {
            return value
        }
    }

    return null
}

/**
 * Map raw amenity strings to standardized database values
 *
 * @param rawAmenities - Array of raw amenity strings from Excel
 * @returns Array of standardized amenity names
 */
export function mapAmenities(rawAmenities: string[]): string[] {
    if (!Array.isArray(rawAmenities)) {
        logger.warn('Invalid amenities input', { input: rawAmenities })
        return []
    }

    const mapped = new Set<string>()
    const unmatched: string[] = []

    for (const raw of rawAmenities) {
        // Skip empty values
        if (!raw || typeof raw !== 'string') {
            continue
        }

        // Handle comma-separated values
        const parts = raw.split(/[,;/]+/).map((p) => p.trim())

        for (const part of parts) {
            if (!part) continue

            const result = mapSingleAmenity(part)
            if (result) {
                mapped.add(result)
            } else {
                unmatched.push(part)
            }
        }
    }

    if (unmatched.length > 0) {
        logger.warn('Unmatched amenities', { unmatched })
    }

    return Array.from(mapped)
}

/**
 * Validate that all amenities are in the allowed list
 *
 * @param amenities - Array of amenity names to validate
 * @returns Object with valid and invalid amenities separated
 */
export function validateAmenities(
    amenities: string[]
): { valid: string[]; invalid: string[] } {
    const valid: string[] = []
    const invalid: string[] = []

    for (const amenity of amenities) {
        if (VALID_AMENITIES.includes(amenity)) {
            valid.push(amenity)
        } else {
            invalid.push(amenity)
        }
    }

    return { valid, invalid }
}

/**
 * Get suggestions for an invalid amenity
 *
 * @param invalidAmenity - The invalid amenity name
 * @returns Array of suggested valid amenities
 */
export function getAmenitySuggestions(invalidAmenity: string): string[] {
    const normalized = invalidAmenity.toLowerCase().trim()
    const suggestions: string[] = []

    for (const valid of VALID_AMENITIES) {
        const validLower = valid.toLowerCase()
        // Check for substring match or similarity
        if (
            validLower.includes(normalized) ||
            normalized.includes(validLower) ||
            levenshteinDistance(normalized, validLower) <= 2
        ) {
            suggestions.push(valid)
        }
    }

    return suggestions.slice(0, 3) // Return top 3 suggestions
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = []

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i]
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1]
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                )
            }
        }
    }

    return matrix[b.length][a.length]
}
