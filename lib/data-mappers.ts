import type { Property } from './types'

/**
 * Database row type matching actual Supabase schema
 */
export interface PropertyRow {
    id: string
    title: string
    description: string | null
    property_type: 'PG' | 'Co-living' | 'Rent'
    room_type: 'Single' | 'Double' | 'Triple' | 'Four Sharing' | 'Apartment' | '1RK'

    // Location
    country: string | null
    city: string
    area: string
    locality: string | null
    address: string | null
    pincode: string | null
    landmark: string | null
    latitude: number | null
    longitude: number | null
    google_maps_url: string | null

    // Owner
    owner_id: string | null
    owner_name: string
    owner_contact: string
    owner_verified: boolean

    // Pricing
    one_rk_price: number | null
    private_room_price: number | null
    double_sharing_price: number | null
    triple_sharing_price: number | null
    four_sharing_price: number | null
    deposit: number | null
    maintenance: number | null

    // Details
    furnishing: 'Fully Furnished' | 'Semi Furnished' | 'Unfurnished' | null
    floor_number: number | null
    total_floors: number | null
    room_size: number | null
    preferred_tenant: 'Male' | 'Female' | 'Couple' | 'Any' | null

    // Features
    facilities: string[] | null
    amenities: string[] | null
    usp: string | null
    rules: string[] | null
    nearby_places: string[] | null

    // Media
    images: string[] | null
    videos: string[] | null

    // Status
    availability: 'Available' | 'Occupied' | 'Under Maintenance'
    featured: boolean
    verified: boolean
    status: 'active' | 'inactive' | 'pending' | 'rejected'

    // Metadata
    views: number
    psn: number | null
    source: string | null

    // Joined Owner Data (Optional)
    owner?: {
        name: string
        email: string
        phone: string
        verified: boolean
        avatar_url?: string
    } | null

    // Timestamps
    created_at: string
    updated_at: string
    published_at: string | null
}

/**
 * Convert database row to frontend Property type
 */
export function mapPropertyFromDB(row: PropertyRow): Property {
    // Determine primary price as the minimum of all available room prices
    const availablePrices = [
        row.one_rk_price,
        row.private_room_price,
        row.double_sharing_price,
        row.triple_sharing_price,
        row.four_sharing_price
    ].filter((p): p is number => p !== null && p !== undefined && p > 0)

    const price = availablePrices.length > 0 ? Math.min(...availablePrices) : 0

    // Prefer joined owner data if available, fallback to snapshot data
    const ownerData = {
        id: row.owner_id || '',
        name: row.owner?.name || row.owner_name,
        phone: row.owner?.phone || row.owner_contact,
        email: row.owner?.email || '',
        verified: row.owner?.verified ?? row.owner_verified,
        avatar: row.owner?.avatar_url
    }

    return {
        id: row.id,
        title: row.title,
        description: row.description || '',
        price,
        roomPrices: {
            '1rk': row.one_rk_price || undefined,
            single: row.private_room_price || undefined,
            double: row.double_sharing_price || undefined,
            triple: row.triple_sharing_price || undefined,
            four: row.four_sharing_price || undefined,
        },
        location: {
            city: row.city,
            area: row.area,
            address: row.address || '',
            pincode: row.pincode || undefined,
            locality: row.locality || undefined,
            latitude: row.latitude || undefined,
            longitude: row.longitude || undefined,
        },
        propertyType: row.property_type,
        roomType: row.room_type as 'Single' | 'Double' | 'Triple' | 'Four Sharing' | 'Apartment' | '1RK',
        images: row.images || [],
        amenities: row.amenities || [],
        owner: ownerData,
        availability: row.availability,
        postedDate: new Date(row.created_at),
        views: row.views || 0,
        featured: row.featured || false,
        verified: row.verified || false,
        rules: row.rules || [],
        nearbyPlaces: row.nearby_places || [],
        deposit: row.deposit || undefined,
        maintenance: row.maintenance || undefined,
        furnishing: row.furnishing || undefined,
        floorNumber: row.floor_number || undefined,
        totalFloors: row.total_floors || undefined,
        roomSize: row.room_size || undefined,
        preferredTenant: row.preferred_tenant || undefined,
        createdAt: row.created_at,
    }
}

/**
 * Convert frontend Property to database insert format
 * @param statusOverride - Override the default 'pending' status (used by admin to auto-approve with 'active')
 */
export function mapPropertyToDB(
    property: Partial<Property> & {
        ownerId: string
        ownerName: string
        ownerContact: string
        roomPrices?: {
            '1rk'?: number
            single?: number
            double?: number
            triple?: number
            four?: number
        }
    },
    statusOverride?: 'pending' | 'active'
): Partial<PropertyRow> {
    return {
        title: property.title,
        description: property.description,
        property_type: property.propertyType,
        room_type: property.roomType,

        city: property.location?.city,
        area: property.location?.area,
        address: property.location?.address,
        pincode: property.location?.pincode,
        locality: property.location?.locality,
        latitude: property.location?.latitude,
        longitude: property.location?.longitude,

        owner_id: property.ownerId,
        owner_name: property.ownerName,
        owner_contact: property.ownerContact,

        // Handle multiple room prices
        // If roomPrices is provided, use it; otherwise fall back to legacy single price
        // 1RK has its own column (one_rk_price), separate from private_room_price (1BHK/Single)
        one_rk_price: property.roomPrices?.['1rk'] ||
            (property.roomType === '1RK' ? property.price : null),
        private_room_price: property.roomPrices?.single ||
            ((property.roomType === 'Single' || property.roomType === 'Apartment') ? property.price : null),
        double_sharing_price: property.roomPrices?.double ||
            (property.roomType === 'Double' ? property.price : null),
        triple_sharing_price: property.roomPrices?.triple ||
            (property.roomType === 'Triple' ? property.price : null),
        four_sharing_price: property.roomPrices?.four ||
            (property.roomType === 'Four Sharing' ? property.price : null),

        deposit: property.deposit,
        maintenance: property.maintenance,
        furnishing: property.furnishing,
        floor_number: property.floorNumber,
        total_floors: property.totalFloors,
        room_size: property.roomSize,
        preferred_tenant: property.preferredTenant,

        amenities: property.amenities,
        rules: property.rules,
        nearby_places: property.nearbyPlaces,
        images: property.images,

        status: statusOverride || 'pending',
        availability: 'Available',
        featured: false,
        verified: false,
        views: 0,
    }
}
