// Property Types
export interface Property {
    id: string
    title: string
    description: string
    price: number
    roomPrices?: {
        '1rk'?: number
        single?: number
        double?: number
        triple?: number
        four?: number
    }
    location: {
        city: string
        area: string
        address: string
        pincode?: string
        locality?: string
        latitude?: number
        longitude?: number
    }
    propertyType: 'PG' | 'Co-living' | 'Rent'
    roomType: 'Single' | 'Double' | 'Triple' | 'Four Sharing' | 'Apartment' | '1RK'
    images: string[]
    amenities: string[]
    owner: {
        id: string
        name: string
        phone: string
        email: string
        verified: boolean
        avatar?: string
    }
    availability: 'Available' | 'Occupied' | 'Under Maintenance'
    postedDate: Date
    views: number
    featured: boolean
    verified?: boolean
    rules?: string[]
    nearbyPlaces?: string[]
    deposit?: number
    maintenance?: number
    furnishing?: 'Fully Furnished' | 'Semi Furnished' | 'Unfurnished'
    floorNumber?: number
    totalFloors?: number
    roomSize?: number
    preferredTenant?: 'Male' | 'Female' | 'Couple' | 'Any'
    createdAt?: string
    status?: 'pending' | 'active' | 'rejected' | 'inactive'
}

// User Types
export interface User {
    id: string
    name: string
    email: string
    phone?: string
    role: 'admin' | 'owner' | 'tenant'
    avatar?: string
    verified: boolean
    registrationDate: Date
    status: 'active' | 'inactive'
    propertiesCount?: number
    inquiriesCount?: number
}

// Search Filters
export interface SearchFilters {
    location?: string
    propertyType?: 'PG' | 'Co-living' | 'Rent'
    roomType?: string[]
    minPrice?: number
    maxPrice?: number
    amenities?: string[]
    sortBy?: 'price-asc' | 'price-desc' | 'date-desc' | 'popular'
    // Enhanced search filters
    gender?: 'Male' | 'Female' | 'Couple' | 'Any'
    preferredTenant?: string
    lookingFor?: 'PG' | 'Room/Bed'
    useUserLocation?: boolean
    coordinates?: {
        lat: number
        lng: number
    }
    radius?: number // in kilometers
}

// Message Types
export interface Message {
    id: string
    senderId: string
    receiverId: string
    propertyId?: string
    content: string
    timestamp: Date
    read: boolean
}

export interface Conversation {
    id: string
    participantId: string
    participantName: string
    participantAvatar?: string
    lastMessage: string
    lastMessageTime: Date
    unreadCount: number
    propertyId?: string
    propertyTitle?: string
}

// Notification Types
export interface Notification {
    id: string
    userId: string
    type: 'inquiry' | 'message' | 'payment' | 'system'
    title: string
    content: string
    timestamp: Date
    read: boolean
    actionUrl?: string
}

// Export User Data
export interface ExportUser {
    id: string
    name: string
    email: string
    phone?: string
    role: 'tenant' | 'owner'
    registrationDate: string
    status: 'active' | 'inactive'
    propertiesCount?: number
    inquiriesCount?: number
    lastLogin?: string
}

export interface Inquiry {
    id: string
    propertyId: string
    tenantId: string
    ownerId: string
    message: string
    status: 'pending' | 'responded' | 'closed'
    createdAt: string
    property?: {
        title: string
        location: {
            city: string
        }
    }
    tenant?: {
        name: string
        email: string
        phone?: string
        avatar_url?: string
    }
}

export interface Payment {
    id: string
    userId: string
    user_id?: string // Alias for snake_case
    amount: number
    currency: string
    status: 'pending' | 'completed' | 'failed' | 'refunded' | 'success' | string
    plan_name?: string
    payment_method?: string
    created_at?: string
    providerOrderId?: string
    providerPaymentId?: string
    metadata: any
    createdAt?: string
    user?: {
        name: string
        email: string
    }
}

