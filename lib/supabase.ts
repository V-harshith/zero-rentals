import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Configure Supabase client with persistent storage
// CRITICAL: Uses cookies by default to match middleware behavior
// This ensures session consistency between client and server
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Enable automatic token refresh
    autoRefreshToken: true,
    // Persist session across page refreshes
    persistSession: true,
    // Detect session from URL (for email verification links)
    detectSessionInUrl: true,
    // NOTE: No storage override - uses cookies by default to match middleware
    // This ensures session consistency between client and server
    // Flow type for PKCE (more secure)
    flowType: 'pkce',
  },
  // Global settings
  global: {
    headers: {
      'x-application-name': 'zero-rentals',
    },
  },
})

// Database Types
export interface Database {
    public: {
        Tables: {
            users: {
                Row: {
                    id: string
                    email: string
                    name: string
                    phone: string | null
                    role: 'admin' | 'owner' | 'tenant'
                    avatar_url: string | null
                    verified: boolean
                    status: 'active' | 'inactive' | 'suspended'
                    created_at: string
                    updated_at: string
                }
                Insert: Omit<Database['public']['Tables']['users']['Row'], 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Database['public']['Tables']['users']['Insert']>
            }
            properties: {
                Row: {
                    id: string
                    title: string
                    description: string | null
                    property_type: 'PG' | 'Co-living' | 'Rent'
                    room_type: 'Single' | 'Double' | 'Triple' | 'Four Sharing' | 'Apartment' | '1RK'
                    country: string
                    city: string
                    area: string
                    locality: string | null
                    address: string | null
                    landmark: string | null
                    latitude: number | null
                    longitude: number | null
                    google_maps_url: string | null
                    owner_id: string | null
                    owner_name: string
                    owner_contact: string
                    owner_verified: boolean
                    private_room_price: number | null
                    double_sharing_price: number | null
                    triple_sharing_price: number | null
                    four_sharing_price: number | null
                    deposit: number | null
                    maintenance: number | null
                    furnishing: string | null
                    floor_number: number | null
                    total_floors: number | null
                    room_size: number | null
                    preferred_tenant: string | null
                    facilities: string[] | null
                    amenities: string[] | null
                    usp: string | null
                    rules: string[] | null
                    nearby_places: string[] | null
                    images: string[] | null
                    videos: string[] | null
                    availability: 'Available' | 'Occupied' | 'Under Maintenance'
                    featured: boolean
                    verified: boolean
                    status: 'active' | 'inactive' | 'pending' | 'rejected'
                    views: number
                    psn: number | null
                    source: string
                    created_at: string
                    updated_at: string
                    published_at: string | null
                }
                Insert: Omit<Database['public']['Tables']['properties']['Row'], 'id' | 'created_at' | 'updated_at' | 'views'>
                Update: Partial<Database['public']['Tables']['properties']['Insert']>
            }
        }
    }
}
