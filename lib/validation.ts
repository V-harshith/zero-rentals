import { z } from 'zod'

// --- Constants ---
export const PROPERTY_TYPES = ['PG', 'Co-living', 'Rent'] as const
export const ROOM_TYPES = ['Single', 'Double', 'Triple', 'Four Sharing', 'Apartment', '1RK'] as const
export const GENDERS = ['Male', 'Female', 'Couple'] as const

// --- Property Schema ---
export const PropertySchema = z.object({
    title: z.string().min(5, "Title must be at least 5 characters").max(100, "Title too long"),
    description: z.string().optional(),
    propertyType: z.enum(PROPERTY_TYPES),
    roomType: z.enum(ROOM_TYPES),

    // Location
    location: z.object({
        city: z.string().min(2, "City name too short"),
        area: z.string().min(2, "Area name too short"),
        address: z.string().min(10, "Please provide full address"),
        pincode: z.string().length(6, "Pincode must be 6 digits").optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
    }),

    // Pricing
    price: z.number().int().positive("Price must be positive").max(1000000, "Price seems too high"),
    deposit: z.number().int().nonnegative("Deposit cannot be negative").optional(),
    maintenance: z.number().int().nonnegative("Maintenance cannot be negative").optional(),

    // Details
    amenities: z.array(z.string()).max(20, "Too many amenities selected"),
    rules: z.array(z.string()).max(20, "Too many rules").optional(),
    furnishing: z.enum(['Fully Furnished', 'Semi Furnished', 'Unfurnished']).optional(),
    floorNumber: z.number().int().optional(),
    totalFloors: z.number().int().optional(),
    roomSize: z.number().int().optional(),
    preferredTenant: z.enum(GENDERS).optional(),

    // Images
    images: z.array(z.string()).max(10, "Maximum 10 images allowed"), // URLs or local previews (will be URLs after upload)

    // Owner Info
    ownerId: z.string(),
    ownerName: z.string(),
    ownerContact: z.string(),
})

// --- User Schema ---
export const UserProfileSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    phone: z.string().regex(/^\d{10}$/, "Phone must be exactly 10 digits").optional().or(z.literal("")),
    role: z.enum(['owner', 'tenant', 'admin'])
})

// --- Inquiry Schema ---
export const InquirySchema = z.object({
    propertyId: z.string().uuid(),
    ownerId: z.string().uuid(),
    tenantId: z.string().uuid(),
    message: z.string().min(1, "Message cannot be empty").max(1000, "Message too long")
})


// --- Helper Types ---
export type PropertyInput = z.infer<typeof PropertySchema>
export type UserInput = z.infer<typeof UserProfileSchema>
export type InquiryInput = z.infer<typeof InquirySchema>
