"use client"

export interface RoomData {
    selected: boolean
    rent: string
    deposit: string
    amenities: string[]
}

export interface FormData {
    propertyType: 'PG' | 'Co-living' | 'Rent'
    // Step 1: Basics
    title: string
    description: string
    city: string
    area: string
    address: string
    pincode: string

    // Step 2: Room Selection
    rooms: {
        '1rk': RoomData
        single: RoomData
        double: RoomData
        triple: RoomData
        four: RoomData
        [key: string]: RoomData
    }
    // Step 3: PG Details / Rules
    gender: string
    preferredTenant: string
    noSmoking: boolean
    noNonVeg: boolean
    noDrinking: boolean
    noLoudMusic: boolean    // Rent only
    noOppGender: boolean    // Rent only
    otherRules: string
    directionsTip: string
    
    // Furnishing
    furnishing: 'Fully Furnished' | 'Semi Furnished' | 'Unfurnished' | ''

    // Images (post mode uses File[], edit mode uses string[] for existing)
    images: File[]
    // Edit mode fields
    existingImages?: string[]
    newImages?: File[]
}

// ==========================================
// ROOM TYPES — per property type
// ==========================================

export const PG_ROOM_TYPES = [
    { id: "single", label: "Private Room", icon: "🛏️" },
    { id: "double", label: "Double Sharing", icon: "🛏️🛏️" },
    { id: "triple", label: "Triple Sharing", icon: "🛏️🛏️🛏️" },
    { id: "four", label: "Four Sharing", icon: "🛏️🛏️🛏️🛏️" },
]

export const COLIVING_ROOM_TYPES = [
    { id: "single", label: "Private Room", icon: "🛏️" },
    { id: "double", label: "Double Sharing", icon: "🛏️🛏️" },
]

export const RENT_ROOM_TYPES = [
    { id: "1rk", label: "1 RK", icon: "🏠" },
    { id: "single", label: "1 BHK", icon: "🏠" },
    { id: "double", label: "2 BHK", icon: "🏠🏠" },
    { id: "triple", label: "3 BHK", icon: "🏠🏠🏠" },
    { id: "four", label: "4 BHK", icon: "🏠🏠🏠🏠" },
]

export const getRoomTypes = (propertyType: 'PG' | 'Co-living' | 'Rent') => {
    if (propertyType === 'Rent') return RENT_ROOM_TYPES
    if (propertyType === 'Co-living') return COLIVING_ROOM_TYPES
    return PG_ROOM_TYPES
}

// For backward compatibility
export const ROOM_TYPES = PG_ROOM_TYPES

// ==========================================
// AMENITIES — per property type
// ==========================================

export const ALL_AMENITIES = [
    { id: "WiFi", label: "WiFi", icon: "📶" },
    { id: "AC", label: "AC", icon: "❄️" },
    { id: "Parking", label: "Parking", icon: "🚗" },
    { id: "Gym", label: "Gym", icon: "💪" },
    { id: "Security", label: "Security", icon: "🛡️" },
    { id: "Laundry", label: "Laundry", icon: "🧺" },
    { id: "Meals", label: "Meals", icon: "🍽️" },
    { id: "Power Backup", label: "Power Backup", icon: "🔋" },
    { id: "Room Cleaning", label: "Room Cleaning", icon: "🧹" },
    { id: "Geyser", label: "Geyser", icon: "🚿" },
    { id: "Warden", label: "Warden", icon: "👮" },
]

// Rent properties exclude PG-specific services
const RENT_EXCLUDED_AMENITIES = ["Meals", "Room Cleaning", "Warden"]

export const getAmenities = (propertyType: 'PG' | 'Co-living' | 'Rent') => {
    if (propertyType === 'Rent') {
        return ALL_AMENITIES.filter(a => !RENT_EXCLUDED_AMENITIES.includes(a.id))
    }
    return ALL_AMENITIES
}

// Backward compatibility
export const ROOM_AMENITIES = ALL_AMENITIES

// ==========================================
// HOUSE RULES — per property type
// ==========================================

export const PG_COLIVING_RULES = [
    { id: 'noSmoking', label: 'No Smoking', icon: '🚭' },
    { id: 'noNonVeg', label: 'No Non-Veg', icon: '🥗' },
    { id: 'noDrinking', label: 'No Drinking', icon: '🚫' },
]

export const RENT_RULES = [
    { id: 'noSmoking', label: 'No Smoking', icon: '🚭' },
    { id: 'noNonVeg', label: 'No Non-Veg', icon: '🥗' },
    { id: 'noDrinking', label: 'No Drinking', icon: '🚫' },
    { id: 'noLoudMusic', label: 'No Loud Music', icon: '🔇' },
    { id: 'noOppGender', label: 'No Opposite Gender', icon: '🚫' },
]

export const getHouseRules = (propertyType: 'PG' | 'Co-living' | 'Rent') => {
    if (propertyType === 'Rent') return RENT_RULES
    return PG_COLIVING_RULES
}

// ==========================================
// GENDER OPTIONS — per property type
// ==========================================

export const getGenderOptions = (propertyType: 'PG' | 'Co-living' | 'Rent') => {
    if (propertyType === 'PG') {
        return [
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
        ]
    }
    // Co-living and Rent have all options
    return [
        { value: 'couple', label: 'Couple' },
        { value: 'male', label: 'Male' },
        { value: 'female', label: 'Female' },
        { value: 'any', label: 'Any' },
    ]
}

// ==========================================
// ROOM TYPE LABEL HELPERS
// ==========================================

export const getRoomTypeLabel = (roomId: string, propertyType: 'PG' | 'Co-living' | 'Rent') => {
    const types = getRoomTypes(propertyType)
    return types.find(t => t.id === roomId)?.label || roomId
}

// Map form room key to DB room_type value
export const ROOM_KEY_TO_DB: Record<string, string> = {
    '1rk': '1RK',
    'single': 'Single',
    'double': 'Double',
    'triple': 'Triple',
    'four': 'Four Sharing',
}

// Map DB room_type value to form room key
export const DB_TO_ROOM_KEY: Record<string, string> = {
    '1RK': '1rk',
    'Single': 'single',
    'Double': 'double',
    'Triple': 'triple',
    'Four Sharing': 'four',
    'Apartment': 'single',
}
