import { supabase } from '@/lib/supabase'
import type { Property, User, SearchFilters, Inquiry, Payment } from '@/lib/types'
import { mapPropertyFromDB, mapPropertyToDB, type PropertyRow } from '@/lib/data-mappers'
import { PropertySchema } from '@/lib/validation'
import { PLAN_TIER_RANK, getPlanTierRank } from '@/lib/constants'

// ============================================================================
// PROPERTY STATUS STATE MACHINE
// ============================================================================

export type PropertyStatus = 'pending' | 'active' | 'rejected' | 'inactive'

interface StatusTransition {
  from: PropertyStatus
  to: PropertyStatus
  action: string
  requiresAdmin: boolean
}

// Valid state transitions for properties
const VALID_TRANSITIONS: StatusTransition[] = [
  // Approval flow
  { from: 'pending', to: 'active', action: 'approve', requiresAdmin: true },
  { from: 'pending', to: 'rejected', action: 'reject', requiresAdmin: true },

  // Deactivation flow
  { from: 'active', to: 'inactive', action: 'deactivate', requiresAdmin: false },
  { from: 'inactive', to: 'active', action: 'reactivate', requiresAdmin: false },

  // Rejection and resubmission
  { from: 'active', to: 'rejected', action: 'reject', requiresAdmin: true },
  { from: 'rejected', to: 'pending', action: 'resubmit', requiresAdmin: false },
  { from: 'rejected', to: 'active', action: 'approve', requiresAdmin: true },
]

/**
 * Validates if a status transition is allowed
 */
export function isValidStatusTransition(
  from: PropertyStatus,
  to: PropertyStatus
): boolean {
  if (from === to) return true // Idempotent
  return VALID_TRANSITIONS.some(t => t.from === from && t.to === to)
}

/**
 * Gets the action name for a status transition
 */
export function getTransitionAction(
  from: PropertyStatus,
  to: PropertyStatus
): string | null {
  const transition = VALID_TRANSITIONS.find(t => t.from === from && t.to === to)
  return transition?.action || null
}

/**
 * Gets all valid next statuses from a given status
 */
export function getValidNextStatuses(from: PropertyStatus): PropertyStatus[] {
  return VALID_TRANSITIONS
    .filter(t => t.from === from)
    .map(t => t.to)
}

// ============================================================================
// HELPER FUNCTIONS (Internal)
// ============================================================================

function buildSearchQuery(filters: SearchFilters) {
  let query = supabase
    .from('properties')
    .select('*, owner:users!owner_id(name, email, phone, avatar_url, verified)')
    .eq('status', 'active')
    .eq('availability', 'Available')

  if (filters.propertyType) {
    query = query.eq('property_type', filters.propertyType)
  }

  // Geospatial filter (if coordinates provided)
  if (filters.coordinates && filters.coordinates.lat && filters.coordinates.lng) {
    const lat = filters.coordinates.lat
    const lng = filters.coordinates.lng
    const radius = filters.radius || 10 // default 10km

    // items within roughly radius km (approximation: 1 deg ~ 111km)
    const delta = radius / 111

    query = query
      .gte('latitude', lat - delta)
      .lte('latitude', lat + delta)
      .gte('longitude', lng - delta)
      .lte('longitude', lng + delta)
  } else if (filters.location) {
    // INDUSTRY-STANDARD LOCATION SEARCH
    // Matches: City, Area, Locality, Pincode, Landmark
    // SECURITY FIX: Sanitize input to prevent SQL injection
    const cleanLoc = filters.location.trim()
      .replace(/[%_]/g, '') // Remove wildcards
      .replace(/[<>"'&]/g, '') // Remove HTML/JS special chars
      .substring(0, 50) // Limit length

    if (cleanLoc) {
      // Check if input is a pincode (exactly 6 digits)
      const isPincode = /^\d{6}$/.test(cleanLoc)

      if (isPincode) {
        // Exact pincode match for better accuracy
        query = query.eq('pincode', cleanLoc)
      } else {
        // Multi-field fuzzy search (case-insensitive)
        // SECURITY: Additional validation before building query
        const sanitizedLoc = cleanLoc.replace(/[^a-zA-Z0-9\s\-,.]/g, '')
        if (sanitizedLoc) {
          query = query.or(`city.ilike.%${sanitizedLoc}%,area.ilike.%${sanitizedLoc}%,locality.ilike.%${sanitizedLoc}%,landmark.ilike.%${sanitizedLoc}%`)
        }
      }
    }
    query = query.limit(50)
  } else {
    query = query.limit(50)
  }

  if (filters.roomType?.length) {
    // Map display labels to database values and build price-based filter
    // A property should appear if it has a price set for ANY of the selected room types
    const roomTypeToPriceColumn: Record<string, string> = {
      'Private Room': 'private_room_price',
      '1 RK': 'private_room_price',
      '1 BHK': 'private_room_price',
      'Single': 'private_room_price',
      'Double': 'double_sharing_price',
      '2 BHK': 'double_sharing_price',
      'Triple': 'triple_sharing_price',
      '3 BHK': 'triple_sharing_price',
      'Four Sharing': 'four_sharing_price',
      '4 BHK': 'four_sharing_price'
    }

    // Get unique price columns for the selected room types
    const priceColumns = filters.roomType
      .map(t => roomTypeToPriceColumn[t])
      .filter((col): col is string => col !== undefined)

    // Remove duplicates
    const uniquePriceColumns = [...new Set(priceColumns)]

    if (uniquePriceColumns.length > 0) {
      // Build OR condition: property matches if ANY of the price columns is not null
      const orConditions = uniquePriceColumns.map(col => `${col}.not.is.null`)
      query = query.or(orConditions.join(','))
    }
  }

  if (filters.amenities?.length) {
    query = query.contains('amenities', filters.amenities)
  }

  // Gender filter (preferredTenant) - Updated for Male/Female/Couple
  if (filters.gender) {
    // Male or Female search should ALSO match Couple properties
    if (filters.gender === 'Male' || filters.gender === 'Female') {
      query = query.or(`preferred_tenant.eq.${filters.gender},preferred_tenant.eq.Couple`)
    } else if (filters.gender === 'Couple') {
      // Couple search only matches Couple properties
      query = query.eq('preferred_tenant', 'Couple')
    }
    // 'Any' doesn't need filtering
  }

  // Advanced preferred tenant filter
  if (filters.preferredTenant && filters.preferredTenant !== 'Any') {
    query = query.eq('preferred_tenant', filters.preferredTenant)
  }

  // Looking For filter (maps to property type)
  // Only apply if propertyType is NOT explicitly set
  if (!filters.propertyType && filters.lookingFor) {
    if (filters.lookingFor === 'PG') {
      query = query.eq('property_type', 'PG')
    } else if (filters.lookingFor === 'Room/Bed') {
      query = query.in('property_type', ['Co-living', 'Rent'])
    }
  }

  return applySorting(query, filters.sortBy)
}

function applySorting(query: any, sortBy?: string) {
  // ALWAYS prioritize featured properties first, then apply the requested sort
  switch (sortBy) {
    case 'price-asc':
      return query
        .order('featured', { ascending: false })
        .order('private_room_price', { ascending: true, nullsFirst: false })
    case 'price-desc':
      return query
        .order('featured', { ascending: false })
        .order('private_room_price', { ascending: false, nullsFirst: false })
    case 'popular':
      return query
        .order('featured', { ascending: false })
        .order('views', { ascending: false })
    case 'featured':
      return query
        .order('featured', { ascending: false })
        .order('created_at', { ascending: false })
    default:
      return query
        .order('featured', { ascending: false })
        .order('created_at', { ascending: false })
  }
}

function filterByPriceRange(properties: Property[], filters: SearchFilters): Property[] {
  // Skip filtering if no price constraints are set (or defaults are used)
  const hasMinPrice = filters.minPrice !== undefined && filters.minPrice > 0
  const hasMaxPrice = filters.maxPrice !== undefined && filters.maxPrice < 50000

  if (!hasMinPrice && !hasMaxPrice) {
    return properties
  }

  return properties.filter(p => {
    // Get all available room prices for this property
    const roomPrices = [
      p.roomPrices?.['1rk'],
      p.roomPrices?.single,
      p.roomPrices?.double,
      p.roomPrices?.triple,
      p.roomPrices?.four,
      p.price // Also include the computed minimum price as fallback
    ].filter((price): price is number => price !== undefined && price > 0)

    // If no prices available, exclude the property when filtering by price
    if (roomPrices.length === 0) {
      return false
    }

    // Check if ANY room price falls within the specified range
    // This ensures properties are shown if they have at least one room type
    // that matches the user's budget
    return roomPrices.some(price => {
      const aboveMin = !hasMinPrice || price >= filters.minPrice!
      const belowMax = !hasMaxPrice || price <= filters.maxPrice!
      return aboveMin && belowMax
    })
  })
}

async function incrementPropertyViews(id: string, currentViews: number) {
  await supabase
    .from('properties')
    .update({ views: currentViews + 1 })
    .eq('id', id)
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function getProperties(): Promise<Property[]> {
  try {
    const today = new Date().toISOString()

    // Get owners with valid active subscriptions and their plan names
    const { data: validSubscribers, error: subError } = await supabase
      .from('subscriptions')
      .select('user_id, plan_name')
      .eq('status', 'active')
      .gt('end_date', today)

    // Subscription fetch errors are handled silently - properties will still be shown

    // Create a map of owner_id to plan tier rank
    const ownerTierMap = new Map<string, number>()
    validSubscribers?.forEach(s => {
      const rank = getPlanTierRank(s.plan_name)
      // Only update if higher rank (or not set yet)
      const existingRank = ownerTierMap.get(s.user_id)
      if (!existingRank || rank > existingRank) {
        ownerTierMap.set(s.user_id, rank)
      }
    })

    // Get all active, available properties
    const { data, error } = await supabase
      .from('properties')
      .select('*, owner:users!owner_id(name, email, phone, avatar_url, verified)')
      .eq('status', 'active')
      .eq('availability', 'Available')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return []
    }

    const properties = (data || []) as PropertyRow[]

    // Sort: Plan tier (highest first) -> Featured -> Created date
    const sortedProperties = properties.sort((a, b) => {
      const aTier = ownerTierMap.get(a.owner_id || '') ?? PLAN_TIER_RANK.FREE
      const bTier = ownerTierMap.get(b.owner_id || '') ?? PLAN_TIER_RANK.FREE

      // Different tiers: higher tier first
      if (aTier !== bTier) {
        return bTier - aTier
      }

      // Same tier: featured first
      if (a.featured && !b.featured) return -1
      if (!a.featured && b.featured) return 1

      // Same tier and featured status: newest first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    return sortedProperties.map(mapPropertyFromDB)
  } catch (error) {
    console.error('[DataService] getProperties failed:', error)
    return []
  }
}

export async function getFeaturedProperties(limit = 6): Promise<Property[]> {
  try {
    const today = new Date().toISOString()

    // Get owners with valid active subscriptions and their plan names
    const { data: validSubscribers, error: subError } = await supabase
      .from('subscriptions')
      .select('user_id, plan_name')
      .eq('status', 'active')
      .gt('end_date', today)

    // Subscription fetch errors are handled silently - properties will still be shown

    // Create a map of owner_id to plan tier rank
    const ownerTierMap = new Map<string, number>()
    validSubscribers?.forEach(s => {
      const rank = getPlanTierRank(s.plan_name)
      // Only update if higher rank (or not set yet)
      const existingRank = ownerTierMap.get(s.user_id)
      if (!existingRank || rank > existingRank) {
        ownerTierMap.set(s.user_id, rank)
      }
    })

    // Get all featured properties
    // Note: We only filter by status='active' for moderation, not by availability
    // Featured properties should appear regardless of availability (Available/Occupied/etc)
    const { data, error } = await supabase
      .from('properties')
      .select('*, owner:users!owner_id(name, email, phone, avatar_url, verified)')
      .eq('status', 'active')
      .eq('featured', true)
      .order('created_at', { ascending: false })
      .limit(limit * 2) // Fetch more to allow for sorting

    if (error) {
      return []
    }

    const properties = (data || []) as PropertyRow[]

    // Sort: Plan tier (highest first) -> Created date
    const sortedProperties = properties.sort((a, b) => {
      const aTier = ownerTierMap.get(a.owner_id || '') ?? PLAN_TIER_RANK.FREE
      const bTier = ownerTierMap.get(b.owner_id || '') ?? PLAN_TIER_RANK.FREE

      // Different tiers: higher tier first
      if (aTier !== bTier) {
        return bTier - aTier
      }

      // Same tier: newest first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    return sortedProperties.slice(0, limit).map(mapPropertyFromDB)
  } catch (error) {
    console.error('[DataService] getFeaturedProperties failed:', error)
    return []
  }
}

export async function getTotalPropertyCount(): Promise<number> {
  const { count, error } = await supabase
    .from('properties')
    .select('*', { count: 'exact', head: true })

  if (error) {
    return 0
  }

  return count || 0
}

export async function getPropertyById(id: string): Promise<Property | null> {
  try {
    // Validate UUID format to prevent database errors
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      return null
    }

    const { data, error } = await supabase
      .from('properties')
      .select('*, owner:users!owner_id(name, email, phone, avatar_url, verified)')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      throw new Error(error.message || 'Failed to fetch property')
    }

    if (!data) {
      return null
    }

    // Note: View tracking has been removed from here to prevent counting:
    // - Owner viewing their own property
    // - Admin previewing properties
    // - Page refreshes and tab switches
    // Views should be tracked separately via a dedicated endpoint that checks user context

    return mapPropertyFromDB(data as PropertyRow)
  } catch (error) {
    console.error('[DataService] getPropertyById failed:', error)
    return null
  }
}

export async function searchProperties(filters: SearchFilters, signal?: AbortSignal): Promise<Property[]> {
  try {
    // Check if request was cancelled before starting
    if (signal?.aborted) {
      throw new Error('AbortError')
    }

    const today = new Date().toISOString()

    // Get owners with valid active subscriptions and their plan names
    const { data: validSubscribers, error: subError } = await supabase
      .from('subscriptions')
      .select('user_id, plan_name')
      .eq('status', 'active')
      .gt('end_date', today)

    // Subscription fetch errors are handled silently - properties will still be shown

    // Check if request was cancelled after subscription fetch
    if (signal?.aborted) {
      throw new Error('AbortError')
    }

    // Create a map of owner_id to plan tier rank
    const ownerTierMap = new Map<string, number>()
    validSubscribers?.forEach(s => {
      const rank = getPlanTierRank(s.plan_name)
      // Only update if higher rank (or not set yet)
      const existingRank = ownerTierMap.get(s.user_id)
      if (!existingRank || rank > existingRank) {
        ownerTierMap.set(s.user_id, rank)
      }
    })

    const query = buildSearchQuery(filters)
    const { data, error } = await query

    if (error) {
      return [] // Don't throw - return empty array
    }

    // Check if request was cancelled after data fetch
    if (signal?.aborted) {
      throw new Error('AbortError')
    }

    const properties = (data as PropertyRow[])

    // Sort: Plan tier (highest first) -> Featured -> Created date
    const sortedProperties = properties.sort((a, b) => {
      const aTier = ownerTierMap.get(a.owner_id || '') ?? PLAN_TIER_RANK.FREE
      const bTier = ownerTierMap.get(b.owner_id || '') ?? PLAN_TIER_RANK.FREE

      // Different tiers: higher tier first
      if (aTier !== bTier) {
        return bTier - aTier
      }

      // Same tier: featured first
      if (a.featured && !b.featured) return -1
      if (!a.featured && b.featured) return 1

      // Same tier and featured status: newest first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    const mappedProperties = sortedProperties.map(mapPropertyFromDB)
    return filterByPriceRange(mappedProperties, filters)
  } catch (error) {
    // Re-throw abort errors for the caller to handle
    if (error instanceof Error && error.message === 'AbortError') {
      throw error
    }
    return []
  }
}

export async function createProperty(
  property: Partial<Property> & { ownerId: string; ownerName: string; ownerContact: string },
  options?: { isAdminPost?: boolean }
): Promise<{ data: Property | null; error: any }> {
  try {
    const parseResult = PropertySchema.safeParse(property)
    if (!parseResult.success) {
      // 🔥 CRITICAL FIX: Log validation errors for debugging
      const errorMessages = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      console.error('Property validation failed:', errorMessages, 'Property data:', property)
      return { data: null, error: { message: `Validation Failed: ${errorMessages}`, details: parseResult.error.errors } }
    }

    // Skip property limit checks for admin posts
    if (!options?.isAdminPost) {
      const { checkPropertyLimit, getTierFeatures } = await import('@/lib/subscription-service')
      const [limitCheck, features] = await Promise.all([
        checkPropertyLimit(property.ownerId),
        getTierFeatures(property.ownerId)
      ])

      if (!limitCheck.allowed) {
        throw new Error(limitCheck.reason || `Limit reached! You have ${limitCheck.current}/${limitCheck.limit} properties on your ${limitCheck.planName} plan.`)
      }

      const dbProperty = mapPropertyToDB(property)

      // Auto-feature based on tier
      if (features.featuredBadge) {
        dbProperty.featured = true
      }

      const { data, error } = await supabase
        .from('properties')
        .insert([dbProperty])
        .select()
        .single()

      if (error) {
        return {
          data: null,
          error: {
            message: error.message || 'Failed to create property',
            code: error.code,
            details: error.details,
            hint: error.hint
          }
        }
      }

      return { data: mapPropertyFromDB(data as PropertyRow), error: null }
    }

    // Admin post: auto-approve (set to active), skip limits
    const dbProperty = mapPropertyToDB(property, 'active')

    const { data, error } = await supabase
      .from('properties')
      .insert([dbProperty])
      .select()
      .single()

    if (error) {
      return {
        data: null,
        error: {
          message: error.message || 'Failed to create property',
          code: error.code,
          details: error.details,
          hint: error.hint
        }
      }
    }

    return { data: mapPropertyFromDB(data as PropertyRow), error: null }

  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to create property'
    return {
      data: null,
      error: {
        message: errorMessage,
        details: error?.details || error?.toString()
      }
    }
  }
}

export async function updateProperty(
  id: string,
  updates: Partial<Property> & { roomPrices?: Record<string, number> },
  ownerId?: string,
  isAdmin?: boolean
): Promise<{ data: Property | null; error: any }> {
  try {
    // CRITICAL: Verify ownership if ownerId is provided
    // Admins can bypass ownership check
    if (ownerId && !isAdmin) {
      const { data: property, error: fetchError } = await supabase
        .from('properties')
        .select('owner_id')
        .eq('id', id)
        .single()

      if (fetchError || !property) {
        return { data: null, error: { message: 'Property not found' } }
      }

      if (property.owner_id !== ownerId) {
        return { data: null, error: { message: 'Unauthorized: You do not own this property' } }
      }
    }

    const PartialSchema = PropertySchema.partial()
    const parseResult = PartialSchema.safeParse(updates)

    if (!parseResult.success) {
      return { data: null, error: { message: "Validation Failed", details: parseResult.error.errors } }
    }

    const dbUpdates: any = {}

    if (updates.title) dbUpdates.title = updates.title
    if (updates.description) dbUpdates.description = updates.description
    if (updates.propertyType) dbUpdates.property_type = updates.propertyType
    if (updates.roomType) dbUpdates.room_type = updates.roomType
    if (updates.amenities) dbUpdates.amenities = updates.amenities
    if (updates.images) dbUpdates.images = updates.images
    if (updates.availability) dbUpdates.availability = updates.availability
    if (updates.featured !== undefined) dbUpdates.featured = updates.featured
    if (updates.deposit !== undefined) dbUpdates.deposit = updates.deposit
    if (updates.furnishing) dbUpdates.furnishing = updates.furnishing
    if (updates.rules) dbUpdates.rules = updates.rules
    if (updates.preferredTenant) dbUpdates.preferred_tenant = updates.preferredTenant

    // Handle room prices - save all individual room prices
    // 1RK has its own column (one_rk_price), separate from private_room_price (1BHK/Single)
    if (updates.roomPrices) {
      if (updates.roomPrices['1rk'] !== undefined) dbUpdates.one_rk_price = updates.roomPrices['1rk']
      if (updates.roomPrices.single !== undefined) dbUpdates.private_room_price = updates.roomPrices.single
      if (updates.roomPrices.double !== undefined) dbUpdates.double_sharing_price = updates.roomPrices.double
      if (updates.roomPrices.triple !== undefined) dbUpdates.triple_sharing_price = updates.roomPrices.triple
      if (updates.roomPrices.four !== undefined) dbUpdates.four_sharing_price = updates.roomPrices.four
    } else if (updates.price !== undefined) {
      // Legacy single-price fallback
      if (updates.roomType === '1RK') dbUpdates.one_rk_price = updates.price
      else if (updates.roomType === 'Single') dbUpdates.private_room_price = updates.price
      else if (updates.roomType === 'Double') dbUpdates.double_sharing_price = updates.price
      else if (updates.roomType === 'Triple') dbUpdates.triple_sharing_price = updates.price
      else if (updates.roomType === 'Four Sharing') dbUpdates.four_sharing_price = updates.price
    }

    if (updates.location) {
      if (updates.location.city) dbUpdates.city = updates.location.city
      if (updates.location.area) dbUpdates.area = updates.location.area
      if (updates.location.address) dbUpdates.address = updates.location.address
      if (updates.location.pincode) dbUpdates.pincode = updates.location.pincode
      if (updates.location.latitude) dbUpdates.latitude = updates.location.latitude
      if (updates.location.longitude) dbUpdates.longitude = updates.location.longitude
    }

    dbUpdates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('properties')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single()

    if (error) return { data: null, error }

    return { data: mapPropertyFromDB(data as PropertyRow), error: null }
  } catch (error) {
    return { data: null, error }
  }
}

export async function deleteProperty(id: string, ownerId?: string): Promise<{ error: any }> {
  try {
    // Build query with optional ownership check
    let query = supabase.from('properties').delete().eq('id', id)

    // CRITICAL: If ownerId provided, enforce ownership
    if (ownerId) {
      query = query.eq('owner_id', ownerId)
    }

    const { error, count } = await query

    // If ownerId was provided and no rows deleted, it's unauthorized
    if (ownerId && count === 0) {
      return { error: { message: 'Unauthorized: Property not found or you do not own it' } }
    }

    return { error }
  } catch (error) {
    return { error }
  }
}

export async function uploadPropertyImage(
  file: File,
  propertyId: string
): Promise<{ url: string | null; error: any }> {
  try {
    const fileExt = file.name.split('.').pop()
    const fileName = `${propertyId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('property-images')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage
      .from('property-images')
      .getPublicUrl(fileName)

    return { url: publicUrl, error: null }
  } catch (error) {
    return { url: null, error }
  }
}

export async function uploadMultipleImages(
  files: File[],
  propertyId: string
): Promise<{ urls: string[]; errors: any[] }> {
  const urls: string[] = []
  const errors: any[] = []

  for (const file of files) {
    const { url, error } = await uploadPropertyImage(file, propertyId)
    if (url) urls.push(url)
    if (error) errors.push(error)
  }

  return { urls, errors }
}

export async function deletePropertyImage(url: string): Promise<{ error: any }> {
  try {
    const urlParts = url.split('/property-images/')
    if (urlParts.length < 2) {
      throw new Error('Invalid image URL')
    }
    const filePath = urlParts[1]

    const { error } = await supabase.storage
      .from('property-images')
      .remove([filePath])

    return { error }
  } catch (error) {
    return { error }
  }
}

export async function getPendingProperties(limit: number = 100): Promise<Property[]> {
  try {
    const { data, error } = await supabase
      .from('properties')
      .select(`
        *,
        owner:users!owner_id(name, email, phone, avatar_url, verified)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return (data as PropertyRow[]).map(mapPropertyFromDB)
  } catch (error) {
    console.error('getPendingProperties failed:', error)
    return []
  }
}

export async function approveProperty(id: string, csrfToken?: string): Promise<{ error: any }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken
    }

    const response = await fetch(`/api/admin/properties/${id}/approve`, {
      method: 'PUT',
      headers,
    })

    if (!response.ok) {
      const data = await response.json()
      return { error: data.error || 'Failed to approve property' }
    }

    return { error: null }
  } catch (error) {
    return { error }
  }
}

export async function rejectProperty(id: string, reason: string = 'Admin Action', csrfToken?: string): Promise<{ error: any }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken
    }

    const response = await fetch(`/api/admin/properties/${id}/reject`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ reason }),
    })

    if (!response.ok) {
      const data = await response.json()
      return { error: data.error || 'Failed to reject property' }
    }

    return { error: null }
  } catch (error) {
    return { error }
  }
}

export async function createInquiry(inquiry: {
  propertyId: string
  ownerId: string
  tenantId: string
  message: string
}): Promise<{ data: any; error: any }> {
  const { data, error } = await supabase
    .from('inquiries')
    .insert([{
      property_id: inquiry.propertyId,
      owner_id: inquiry.ownerId,
      tenant_id: inquiry.tenantId,
      message: inquiry.message,
      status: 'pending'
    }])
    .select()
    .single()

  return { data, error }
}

export async function getInquiries(userId: string, role: 'owner' | 'tenant', limit: number = 100): Promise<Inquiry[]> {
  const column = role === 'owner' ? 'owner_id' : 'tenant_id'

  const { data, error } = await supabase
    .from('inquiries')
    .select(`
          *,
          property:property_id(title, city),
          tenant:tenant_id(name, email, phone, avatar_url)
      `)
    .eq(column, userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('getInquiries failed:', error)
    return []
  }

  return (data || []).map((item: any) => ({
    id: item.id,
    propertyId: item.property_id,
    tenantId: item.tenant_id,
    ownerId: item.owner_id,
    message: item.message,
    status: item.status,
    createdAt: item.created_at,
    property: {
      title: item.property?.title,
      location: {
        city: item.property?.city
      }
    },
    tenant: item.tenant
  }))
}

export async function updateInquiryStatus(id: string, status: 'pending' | 'responded' | 'closed'): Promise<{ error: any }> {
  const { error } = await supabase
    .from('inquiries')
    .update({ status })
    .eq('id', id)

  return { error }
}

export async function getAllPayments(limit: number = 100): Promise<Payment[]> {
  try {
    // CRITICAL FIX: Query 'payment_logs' table (not 'payments' which doesn't exist)
    // The webhook writes to 'payment_logs' - see app/api/webhooks/razorpay/route.ts
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('payment_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (paymentsError) {
      console.error('Error fetching payments:', paymentsError)
      return []
    }

    if (!paymentsData || paymentsData.length === 0) return []

    // 2. Fetch associated users manually
    const userIds = Array.from(new Set(paymentsData.map((p: any) => p.user_id).filter(Boolean)))

    let usersMap: Record<string, any> = {}

    if (userIds.length > 0) {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', userIds)

      if (usersData) {
        usersData.forEach((u: any) => {
          usersMap[u.id] = u
        })
      }
    }

    // 3. Merge data - map payment_logs schema to Payment type
    return paymentsData.map((item: any) => ({
      id: item.id,
      userId: item.user_id,
      amount: item.amount,
      currency: item.currency || 'INR',
      status: item.status,
      providerOrderId: item.transaction_id, // payment_logs uses transaction_id
      providerPaymentId: item.payment_id,   // payment_logs uses payment_id
      plan_name: item.plan_name,
      payment_method: item.payment_method,
      metadata: item.metadata,
      createdAt: item.created_at,
      created_at: item.created_at,
      user: usersMap[item.user_id] ? {
        name: usersMap[item.user_id].name,
        email: usersMap[item.user_id].email
      } : undefined
    }))
  } catch (error) {
    console.error('getAllPayments failed:', error)
    return []
  }
}

export async function getNotifications(userId: string, limit: number = 100): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('getNotifications failed:', error)
    return []
  }
}

export async function getTenantStats(userId: string): Promise<{
  savedHomes: number
  activeInquiries: number
  newNotifications: number
}> {
  try {
    // Run counts in parallel
    const [savedRes, notificationsRes] = await Promise.all([
      supabase.from('favorites').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('read', false)
    ])

    return {
      savedHomes: savedRes.count || 0,
      activeInquiries: 0, // Feature not implemented (Direct Contact used)
      newNotifications: notificationsRes.count || 0
    }
  } catch (error) {
    console.error('getTenantStats failed:', error)
    return {
      savedHomes: 0,
      activeInquiries: 0,
      newNotifications: 0
    }
  }
}

// ============================================================================
// FAVORITES (Now handled directly in favorites-context.tsx via Supabase)
// ============================================================================

// Favorites functionality has been moved to the client-side context
// All favorites operations now use Supabase directly from the browser
// See: lib/favorites-context.tsx

// ============================================================================
// ATOMIC PROPERTY STATUS TRANSITIONS
// ============================================================================

export interface StatusTransitionResult {
  success: boolean
  message?: string
  error?: string
  propertyId?: string
  oldStatus?: PropertyStatus
  newStatus?: PropertyStatus
  changed?: boolean
  transitionId?: string
}

export interface FeaturedStatusResult {
  success: boolean
  message?: string
  error?: string
  propertyId?: string
  featured?: boolean
  changed?: boolean
}

/**
 * Atomically transitions a property's status using database transaction
 * Uses Supabase RPC for atomicity and state machine validation
 *
 * @param propertyId - The property UUID
 * @param newStatus - Target status
 * @param adminId - Admin user ID (for audit trail)
 * @param reason - Optional reason for the transition
 * @returns StatusTransitionResult with success/failure details
 */
export async function transitionPropertyStatus(
  propertyId: string,
  newStatus: PropertyStatus,
  adminId?: string,
  reason?: string
): Promise<StatusTransitionResult> {
  try {
    // Client-side validation before calling RPC
    const { data: property, error: fetchError } = await supabase
      .from('properties')
      .select('status')
      .eq('id', propertyId)
      .maybeSingle()

    if (fetchError) {
      return {
        success: false,
        error: `Failed to fetch property: ${fetchError.message}`,
        propertyId
      }
    }

    if (!property) {
      return {
        success: false,
        error: 'Property not found',
        propertyId
      }
    }

    // Validate transition is allowed
    const currentStatus = property.status as PropertyStatus
    if (!isValidStatusTransition(currentStatus, newStatus)) {
      return {
        success: false,
        error: `Invalid status transition: ${currentStatus} -> ${newStatus}`,
        propertyId,
        oldStatus: currentStatus,
        newStatus
      }
    }

    // Call the atomic RPC function
    const { data, error } = await supabase.rpc('transition_property_status', {
      p_property_id: propertyId,
      p_new_status: newStatus,
      p_admin_id: adminId || null,
      p_reason: reason || null
    })

    if (error) {
      return {
        success: false,
        error: `Transition failed: ${error.message}`,
        propertyId,
        oldStatus: currentStatus,
        newStatus
      }
    }

    // Parse the JSON result from the RPC
    const result = data as {
      success: boolean
      message?: string
      error?: string
      property_id?: string
      old_status?: PropertyStatus
      new_status?: PropertyStatus
      changed?: boolean
      transition_id?: string
    }

    return {
      success: result.success,
      message: result.message,
      error: result.error,
      propertyId: result.property_id || propertyId,
      oldStatus: result.old_status,
      newStatus: result.new_status,
      changed: result.changed,
      transitionId: result.transition_id
    }
  } catch (error: any) {
    return {
      success: false,
      error: `Unexpected error: ${error?.message || 'Unknown error'}`,
      propertyId
    }
  }
}

/**
 * Sets the featured status of a property atomically via REST API
 * Only active properties can be featured
 *
 * @param propertyId - The property UUID
 * @param featured - Whether to feature the property
 * @returns FeaturedStatusResult with success/failure details
 */
export async function setPropertyFeatured(
  propertyId: string,
  featured: boolean
): Promise<FeaturedStatusResult> {
  try {
    const response = await fetch(`/api/admin/properties/${propertyId}/feature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ featured }),
    })

    const result = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: result.error || `Failed to update featured status: ${response.statusText}`,
        propertyId
      }
    }

    return {
      success: result.success,
      message: result.message,
      propertyId: result.data?.id || propertyId,
      featured: result.data?.featured,
      changed: result.changed
    }
  } catch (error: any) {
    return {
      success: false,
      error: `Unexpected error: ${error?.message || 'Unknown error'}`,
      propertyId
    }
  }
}

/**
 * Bulk transition multiple properties to a new status
 * Each transition is atomic, but the bulk operation is not wrapped in a transaction
 * to avoid long-running transactions
 *
 * @param propertyIds - Array of property UUIDs
 * @param newStatus - Target status for all properties
 * @param adminId - Admin user ID (for audit trail)
 * @param reason - Optional reason for the transition
 * @returns Object with success count, failure count, and individual results
 */
export async function bulkTransitionPropertyStatus(
  propertyIds: string[],
  newStatus: PropertyStatus,
  adminId?: string,
  reason?: string
): Promise<{
  success: boolean
  total: number
  successful: number
  failed: number
  results: StatusTransitionResult[]
}> {
  try {
    const { data, error } = await supabase.rpc('bulk_transition_property_status', {
      p_property_ids: propertyIds,
      p_new_status: newStatus,
      p_admin_id: adminId || null,
      p_reason: reason || null
    })

    if (error) {
      return {
        success: false,
        total: propertyIds.length,
        successful: 0,
        failed: propertyIds.length,
        results: propertyIds.map(id => ({
          success: false,
          error: `Bulk operation failed: ${error.message}`,
          propertyId: id
        }))
      }
    }

    const result = data as {
      success: boolean
      total: number
      successful: number
      failed: number
      results: Array<{
        success: boolean
        message?: string
        error?: string
        property_id?: string
        old_status?: PropertyStatus
        new_status?: PropertyStatus
        changed?: boolean
        transition_id?: string
      }>
    }

    return {
      success: result.success,
      total: result.total,
      successful: result.successful,
      failed: result.failed,
      results: result.results.map(r => ({
        success: r.success,
        message: r.message,
        error: r.error,
        propertyId: r.property_id,
        oldStatus: r.old_status,
        newStatus: r.new_status,
        changed: r.changed,
        transitionId: r.transition_id
      }))
    }
  } catch (error: any) {
    return {
      success: false,
      total: propertyIds.length,
      successful: 0,
      failed: propertyIds.length,
      results: propertyIds.map(id => ({
        success: false,
        error: `Unexpected error: ${error?.message || 'Unknown error'}`,
        propertyId: id
      }))
    }
  }
}

/**
 * Gets the status transition history for a property
 * Requires admin privileges
 *
 * @param propertyId - The property UUID
 * @returns Array of status transition records
 */
export async function getPropertyStatusHistory(propertyId: string): Promise<{
  success: boolean
  history?: Array<{
    id: string
    oldStatus: string
    newStatus: string
    adminName?: string
    reason?: string
    createdAt: string
  }>
  error?: string
}> {
  try {
    const { data, error } = await supabase.rpc('get_property_status_history', {
      p_property_id: propertyId
    })

    if (error) {
      return {
        success: false,
        error: `Failed to fetch history: ${error.message}`
      }
    }

    const history = (data || []).map((item: any) => ({
      id: item.id,
      oldStatus: item.old_status,
      newStatus: item.new_status,
      adminName: item.admin_name,
      reason: item.reason,
      createdAt: item.created_at
    }))

    return {
      success: true,
      history
    }
  } catch (error: any) {
    return {
      success: false,
      error: `Unexpected error: ${error?.message || 'Unknown error'}`
    }
  }
}

/**
 * Legacy wrapper: Approve a property (pending -> active)
 * Maintains backward compatibility with existing code
 */
export async function approvePropertyAtomic(
  propertyId: string,
  adminId?: string
): Promise<StatusTransitionResult> {
  return transitionPropertyStatus(propertyId, 'active', adminId, 'Property approved by admin')
}

/**
 * Legacy wrapper: Reject a property (pending -> rejected or active -> rejected)
 * Maintains backward compatibility with existing code
 */
export async function rejectPropertyAtomic(
  propertyId: string,
  reason?: string,
  adminId?: string
): Promise<StatusTransitionResult> {
  return transitionPropertyStatus(
    propertyId,
    'rejected',
    adminId,
    reason || 'Property rejected by admin'
  )
}

/**
 * Legacy wrapper: Deactivate a property (active -> inactive)
 * Maintains backward compatibility with existing code
 */
export async function deactivateProperty(
  propertyId: string,
  reason?: string
): Promise<StatusTransitionResult> {
  return transitionPropertyStatus(
    propertyId,
    'inactive',
    undefined,
    reason || 'Property deactivated'
  )
}

/**
 * Legacy wrapper: Reactivate a property (inactive -> active)
 * Maintains backward compatibility with existing code
 */
export async function reactivateProperty(
  propertyId: string,
  adminId?: string
): Promise<StatusTransitionResult> {
  return transitionPropertyStatus(
    propertyId,
    'active',
    adminId,
    'Property reactivated'
  )
}
