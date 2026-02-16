import { supabase } from '@/lib/supabase'
import type { Property, User, SearchFilters, Inquiry, Payment } from '@/lib/types'
import { mapPropertyFromDB, mapPropertyToDB, type PropertyRow } from '@/lib/data-mappers'
import { PropertySchema } from '@/lib/validation'
import { PLAN_TIER_RANK, getPlanTierRank } from '@/lib/constants'


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
    const cleanLoc = filters.location.trim().replace(/[%_]/g, '')
    if (cleanLoc) {
      // Check if input is a pincode (exactly 6 digits)
      const isPincode = /^\d{6}$/.test(cleanLoc)
      
      if (isPincode) {
        // Exact pincode match for better accuracy
        query = query.eq('pincode', cleanLoc)
      } else {
        // Multi-field fuzzy search (case-insensitive)
        // Searches across: city, area, locality, pincode (partial), landmark
        query = query.or(`city.ilike.%${cleanLoc}%,area.ilike.%${cleanLoc}%,locality.ilike.%${cleanLoc}%,pincode.ilike.%${cleanLoc}%,landmark.ilike.%${cleanLoc}%`)
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
  } catch {
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
    const { data, error } = await supabase
      .from('properties')
      .select('*, owner:users!owner_id(name, email, phone, avatar_url, verified)')
      .eq('status', 'active')
      .eq('availability', 'Available')
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
  } catch {
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
  } catch {
    return null
  }
}

export async function searchProperties(filters: SearchFilters): Promise<Property[]> {
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

    const query = buildSearchQuery(filters)
    const { data, error } = await query

    if (error) {
      return [] // Don't throw - return empty array
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
  } catch {
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
      return { data: null, error: { message: "Validation Failed", details: parseResult.error.errors } }
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
  updates: Partial<Property> & { roomPrices?: Record<string, number> }
): Promise<{ data: Property | null; error: any }> {
  try {
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

export async function deleteProperty(id: string): Promise<{ error: any }> {
  try {
    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', id)

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

export async function getPendingProperties(): Promise<Property[]> {
  try {
    const { data, error } = await supabase
      .from('properties')
      .select(`
        *,
        owner:users!owner_id(name, email, phone, avatar_url, verified)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data as PropertyRow[]).map(mapPropertyFromDB)
  } catch {
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

export async function getInquiries(userId: string, role: 'owner' | 'tenant'): Promise<Inquiry[]> {
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

  if (error) {
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

export async function getAllPayments(): Promise<Payment[]> {
  try {
    // 1. Fetch raw payments (no join) to avoid schema cache issues
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false })

    if (paymentsError) {
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

    // 3. Merge data
    return paymentsData.map((item: any) => ({
      id: item.id,
      userId: item.user_id,
      amount: item.amount,
      currency: item.currency,
      status: item.status,
      providerOrderId: item.provider_order_id,
      providerPaymentId: item.provider_payment_id,
      plan_name: item.plan_name,
      payment_method: item.payment_method,
      metadata: item.metadata,
      createdAt: item.created_at,
      user: usersMap[item.user_id] ? {
        name: usersMap[item.user_id].name,
        email: usersMap[item.user_id].email
      } : undefined
    }))
  } catch {
    return []
  }
}

export async function getNotifications(userId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  } catch {
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
  } catch {
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
