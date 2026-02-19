/**
 * Pricing validation module
 *
 * Provides server-side pricing constants and validation functions
 * to prevent payment amount manipulation attacks.
 *
 * All prices are in INR (Indian Rupees)
 */

import { PRICING_PLANS } from './constants'

/**
 * Plan price lookup map for O(1) validation
 * Key format: "PlanName-Duration" (e.g., "Silver-1 Month")
 */
export const PLAN_PRICES: Record<string, number> = {
    'Silver-1 Month': 1000,
    'Gold-3 Months': 2700,
    'Platinum-6 Months': 5000,
    'Elite-1 Year': 9000,
}

/**
 * Valid plan durations for each plan
 */
export const PLAN_DURATIONS: Record<string, string[]> = {
    'Silver': ['1 Month'],
    'Gold': ['3 Months'],
    'Platinum': ['6 Months'],
    'Elite': ['1 Year'],
}

/**
 * Property addon payment prices
 * Key format: "plan" (e.g., "1_month", "3_months")
 * Prices are in INR
 */
export const PROPERTY_PRICES: Record<string, number> = {
    '1_month': 1000,
    '3_months': 2700,
    '6_months': 5000,
    '12_months': 9000,
}

/**
 * Property plan durations in days
 */
export const PROPERTY_PLAN_DAYS: Record<string, number> = {
    '1_month': 30,
    '3_months': 90,
    '6_months': 180,
    '12_months': 365,
}

/**
 * Get the official price for a plan
 *
 * @param planName - Name of the plan (Silver, Gold, Platinum, Elite)
 * @param duration - Duration of the plan (e.g., "1 Month")
 * @returns The official price in INR, or null if plan/duration is invalid
 *
 * @example
 * ```typescript
 * const price = getPlanPrice('Gold', '3 Months') // 2700
 * ```
 */
export function getPlanPrice(planName: string, duration: string): number | null {
    const key = `${planName}-${duration}`
    const price = PLAN_PRICES[key]
    return price ?? null
}

/**
 * Validate that a payment amount matches the official plan price
 *
 * @param planName - Name of the plan
 * @param duration - Duration of the plan
 * @param amount - Amount to validate (in INR)
 * @returns Validation result with details
 *
 * @example
 * ```typescript
 * const result = validatePlanAmount('Gold', '3 Months', 2700)
 * // { valid: true, expected: 2700, received: 2700 }
 *
 * const result = validatePlanAmount('Gold', '3 Months', 100)
 * // { valid: false, expected: 2700, received: 100, error: 'Amount mismatch' }
 * ```
 */
export function validatePlanAmount(
    planName: string,
    duration: string,
    amount: number
): {
    valid: boolean
    expected: number | null
    received: number
    error?: string
} {
    // Validate plan name
    if (!planName || typeof planName !== 'string') {
        return {
            valid: false,
            expected: null,
            received: amount,
            error: 'Invalid plan name',
        }
    }

    // Validate duration
    if (!duration || typeof duration !== 'string') {
        return {
            valid: false,
            expected: null,
            received: amount,
            error: 'Invalid duration',
        }
    }

    // Validate amount is a positive number
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
        return {
            valid: false,
            expected: null,
            received: amount,
            error: 'Invalid amount: must be a positive number',
        }
    }

    // Get expected price
    const expectedPrice = getPlanPrice(planName, duration)

    if (expectedPrice === null) {
        return {
            valid: false,
            expected: null,
            received: amount,
            error: `Invalid plan or duration: ${planName} - ${duration}`,
        }
    }

    // Compare amounts (convert to integers to avoid floating point issues)
    const expectedPaise = Math.round(expectedPrice * 100)
    const receivedPaise = Math.round(amount * 100)

    if (expectedPaise !== receivedPaise) {
        return {
            valid: false,
            expected: expectedPrice,
            received: amount,
            error: `Amount mismatch: expected ₹${expectedPrice}, received ₹${amount}`,
        }
    }

    return {
        valid: true,
        expected: expectedPrice,
        received: amount,
    }
}

/**
 * Validate that a property payment amount matches the official price
 *
 * @param plan - Property plan (e.g., "1_month", "3_months")
 * @param amount - Amount to validate (in INR)
 * @returns Validation result with details
 *
 * @example
 * ```typescript
 * const result = validatePropertyAmount('1_month', 1000)
 * // { valid: true, expected: 1000, received: 1000 }
 *
 * const result = validatePropertyAmount('1_month', 500)
 * // { valid: false, expected: 1000, received: 500, error: 'Amount mismatch' }
 * ```
 */
export function validatePropertyAmount(
    plan: string,
    amount: number
): {
    valid: boolean
    expected: number | null
    received: number
    error?: string
} {
    // Validate plan
    if (!plan || typeof plan !== 'string') {
        return {
            valid: false,
            expected: null,
            received: amount,
            error: 'Invalid property plan',
        }
    }

    // Validate amount is a positive number
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
        return {
            valid: false,
            expected: null,
            received: amount,
            error: 'Invalid amount: must be a positive number',
        }
    }

    // Get expected price
    const expectedPrice = PROPERTY_PRICES[plan]

    if (expectedPrice === undefined) {
        return {
            valid: false,
            expected: null,
            received: amount,
            error: `Invalid property plan: ${plan}`,
        }
    }

    // Compare amounts (convert to integers to avoid floating point issues)
    const expectedPaise = Math.round(expectedPrice * 100)
    const receivedPaise = Math.round(amount * 100)

    if (expectedPaise !== receivedPaise) {
        return {
            valid: false,
            expected: expectedPrice,
            received: amount,
            error: `Amount mismatch: expected ₹${expectedPrice}, received ₹${amount}`,
        }
    }

    return {
        valid: true,
        expected: expectedPrice,
        received: amount,
    }
}

/**
 * Check if a plan name is valid
 *
 * @param planName - Plan name to validate
 * @returns True if valid plan name
 */
export function isValidPlanName(planName: string): boolean {
    return planName in PLAN_DURATIONS
}

/**
 * Check if a duration is valid for a given plan
 *
 * @param planName - Plan name
 * @param duration - Duration to validate
 * @returns True if valid duration for the plan
 */
export function isValidDuration(planName: string, duration: string): boolean {
    const validDurations = PLAN_DURATIONS[planName]
    if (!validDurations) return false
    return validDurations.includes(duration)
}

/**
 * Get all available plans with their details
 * Returns a copy to prevent mutation of original data
 */
export function getAllPlans() {
    return [...PRICING_PLANS]
}

/**
 * Format price for display
 *
 * @param amount - Amount in INR
 * @returns Formatted price string (e.g., "₹1,000")
 */
export function formatPrice(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount)
}
