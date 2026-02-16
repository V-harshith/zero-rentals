/**
 * Centralized Plan Limits
 * Aligned with fulfillment logic in payment-actions.ts
 */
export const PLAN_LIMITS = {
    FREE: 1,           // 1 property included
    SILVER: 1,         // 1 property included
    GOLD: 1,           // 1 property included
    PLATINUM: 1,       // 1 property included
    ELITE: 1,          // 1 property included
} as const

/**
 * Plan tier ranking for property sorting
 * Higher number = higher priority in search results
 */
export const PLAN_TIER_RANK = {
    'ELITE': 5,
    'PLATINUM': 4,
    'GOLD': 3,
    'SILVER': 2,
    'FREE': 1,
} as const

/**
 * Get the tier rank for a plan name
 * Handles case insensitivity and unknown plans
 */
export function getPlanTierRank(planName: string | null | undefined): number {
    if (!planName) return PLAN_TIER_RANK.FREE
    const normalizedName = planName.toUpperCase().trim()
    return PLAN_TIER_RANK[normalizedName as keyof typeof PLAN_TIER_RANK] ?? PLAN_TIER_RANK.FREE
}

export const PLAN_NAMES = {
    SILVER: "Silver",
    GOLD: "Gold",
    PLATINUM: "Platinum",
    ELITE: "Elite",
} as const

export const PLAN_FEATURES = {
    FREE: {
        maxPhotos: 5,
        analytics: false,
        featuredBadge: false,
        prioritySupport: false,
        whatsappAccess: false,
    },
    SILVER: {
        maxPhotos: 10,
        analytics: true,
        featuredBadge: true,
        prioritySupport: false,
        whatsappAccess: true,
    },
    GOLD: {
        maxPhotos: 15,
        analytics: true,
        featuredBadge: true,
        prioritySupport: true,
        whatsappAccess: true,
    },
    PLATINUM: {
        maxPhotos: 20,
        analytics: true,
        featuredBadge: true,
        prioritySupport: true,
        whatsappAccess: true,
    },
    ELITE: {
        maxPhotos: 20,
        analytics: true,
        featuredBadge: true,
        prioritySupport: true,
        whatsappAccess: true,
    },
} as const

// Pricing plans for owner subscriptions
export const PRICING_PLANS = [
    {
        planName: "Silver",
        duration: "1 Month",
        price: 1000,
        properties: "1 property listing",
        features: ["Max 10 photos per property", "Featured listing", "Basic Analytics"],
    },
    {
        planName: "Gold",
        duration: "3 Months",
        price: 2700,
        properties: "1 property listing",
        features: ["Max 15 photos per property", "Priority support", "Featured badge"],
        popular: true,
    },
    {
        planName: "Platinum",
        duration: "6 Months",
        price: 5000,
        properties: "1 property listing",
        features: ["Max 20 photos per property", "Top placement", "Advanced Analytics"],
    },
    {
        planName: "Elite",
        duration: "1 Year",
        price: 9000,
        properties: "1 property listing",
        features: ["Max 20 photos per property", "VIP support", "Dedicated Manager"],
        best: true,
    },
] as const

// Dashboard-specific constants
export const DASHBOARD_CONSTANTS = {
    // Analytics thresholds
    TOP_PROPERTY_MIN_VIEWS: 10,
    HIGH_PERFORMANCE_VIEWS_THRESHOLD: 50,

    // Rate limits (per hour)
    RATE_LIMIT_PROPERTY_CREATE: 5,
    RATE_LIMIT_PROPERTY_UPDATE: 20,
    RATE_LIMIT_PROPERTY_DELETE: 10,

    // Retry configuration
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 1000,

    // Pagination
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
} as const

// Route paths - centralized for maintainability
export const ROUTES = {
    HOME: '/',
    PRICING: '/pricing',
    POST_PROPERTY: '/post-property',
    PROFILE_OWNER: '/profile/owner',
    DASHBOARD_OWNER: '/dashboard/owner',
    DASHBOARD_OWNER_ANALYTICS: '/dashboard/owner/analytics',
    PROPERTY_EDIT: (id: string) => `/property/edit/${id}`,
    PROPERTY_ANALYTICS: (id: string) => `/dashboard/owner/analytics/${id}`,
} as const

// Error messages - centralized for consistency
export const ERROR_MESSAGES = {
    PROPERTY: {
        CREATE_FAILED: 'Failed to create property. Please try again.',
        UPDATE_FAILED: 'Failed to update property. Please try again.',
        DELETE_FAILED: 'Failed to delete property. Please try again.',
        FETCH_FAILED: 'Failed to load properties. Please refresh.',
        NOT_FOUND: 'Property not found.',
        UNAUTHORIZED: 'You do not have permission to access this property.',
        LIMIT_REACHED: 'You can only post 1 property. Please delete your existing property to post a new one.',
    },
    SUBSCRIPTION: {
        FETCH_FAILED: 'Unable to load subscription status. Please refresh.',
        PAYMENT_FAILED: 'Payment verification failed. Please contact support if payment was deducted.',
    },
    GENERIC: {
        RATE_LIMIT: 'Rate limit exceeded. Please try again later.',
        INVALID_REQUEST: 'Invalid request. Please try again.',
        SERVER_ERROR: 'Something went wrong. Please try again later.',
    },
} as const

// Popular Indian cities for property listings
export const INDIAN_CITIES = [
    "Bangalore",
    "Hyderabad",
    "Chennai",
    "Mumbai",
    "Pune",
    "Delhi",
    "Kolkata",
    "Ahmedabad",
    "Surat",
    "Jaipur",
    "Lucknow",
    "Kanpur",
    "Nagpur",
    "Indore",
    "Thane",
    "Bhopal",
    "Visakhapatnam",
    "Patna",
    "Vadodara",
    "Ghaziabad",
    "Ludhiana",
    "Agra",
    "Nashik",
    "Faridabad",
    "Meerut",
    "Rajkot",
    "Kalyan-Dombivli",
    "Vasai-Virar",
    "Varanasi",
    "Srinagar",
    "Aurangabad",
    "Dhanbad",
    "Amritsar",
    "Navi Mumbai",
    "Allahabad",
    "Ranchi",
    "Howrah",
    "Coimbatore",
    "Jabalpur",
    "Gwalior",
    "Vijayawada",
    "Jodhpur",
    "Madurai",
    "Raipur",
    "Kota",
] as const
