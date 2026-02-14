"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Heart, Loader2 } from "lucide-react"
import Link from "next/link"
import { useFavorites } from "@/lib/favorites-context"
import { PropertyCard } from "@/components/property-card"
import type { Property } from "@/lib/types"

// Type alias for location derived from Property
type PropertyLocation = Property['location']

// Type for raw property data from Supabase
interface RawProperty {
  id: string
  title?: string
  name?: string
  property_name?: string
  room_type?: string
  roomType?: string
  sharing_type?: string
  private_room_price?: number
  double_sharing_price?: number
  triple_sharing_price?: number
  four_sharing_price?: number
  property_type?: string
  propertyType?: string
  type?: string
  images?: string[]
  image_urls?: string[]
  amenities?: string[]
  status?: string
  availability?: string
  views?: number
  view_count?: number
  featured?: boolean
  verified?: boolean
  is_verified?: boolean
  city?: string
  area?: string
  locality?: string
  address?: string
  pincode?: string
  pin_code?: string
  latitude?: number | string
  longitude?: number | string
  lat?: number | string
  lng?: number | string
  location?: PropertyLocation
}

interface FavoriteRecord {
  id: string
  property_id: string
  properties: RawProperty
}

export function SavedPropertiesTab() {
    const { favoriteIds, isLoading, count } = useFavorites()
    const [properties, setProperties] = useState<Property[]>([])
    const [fetchingDetails, setFetchingDetails] = useState(false)

    // Fetch full property details when favoriteIds change
    useEffect(() => {
        let isMounted = true
        
        async function fetchPropertyDetails() {
            if (favoriteIds.size === 0) {
                if (isMounted) {
                    setProperties([])
                    setFetchingDetails(false)
                }
                return
            }

            try {
                if (isMounted) setFetchingDetails(true)
                
                const response = await fetch('/api/favorites')
                
                if (!response.ok) {
                    if (isMounted) setFetchingDetails(false)
                    return
                }
                
                const { data } = await response.json()
                
                if (!isMounted) return
                
                // Helper function to determine price based on room type
                const getPrice = (prop: RawProperty): number => {
                    const roomType = prop.room_type || prop.roomType || ''

                    // Map room type to appropriate price field
                    switch(roomType.toLowerCase()) {
                        case 'single':
                        case 'private':
                        case 'private room':
                            return prop.private_room_price || 0
                        case 'double':
                        case 'double sharing':
                            return prop.double_sharing_price || 0
                        case 'triple':
                        case 'triple sharing':
                            return prop.triple_sharing_price || 0
                        case 'four sharing':
                        case 'four':
                            return prop.four_sharing_price || 0
                        default:
                            // Fallback: use lowest available price
                            return prop.private_room_price ||
                                   prop.double_sharing_price ||
                                   prop.triple_sharing_price ||
                                   prop.four_sharing_price || 0
                    }
                }
                
                // Normalize database fields to match TypeScript interface
                const validProps = data
                    .map((fav: FavoriteRecord) => {
                        const prop = fav.properties
                        if (!prop || !prop.id) return null

                        // Map database fields to interface fields
                        return {
                            ...prop,
                            // Price mapping based on room type
                            price: getPrice(prop),
                            // Title mapping
                            title: prop.title || prop.name || prop.property_name || 'Property',
                            // Location mapping
                            location: prop.location || {
                                city: prop.city || '',
                                area: prop.area || prop.locality || '',
                                address: prop.address || '',
                                pincode: prop.pincode || prop.pin_code,
                                latitude: prop.latitude || prop.lat,
                                longitude: prop.longitude || prop.lng
                            },
                            // Ensure other fields exist
                            propertyType: prop.propertyType || prop.property_type || prop.type || 'PG',
                            roomType: prop.roomType || prop.room_type || prop.sharing_type || 'Single',
                            images: prop.images || prop.image_urls || [],
                            amenities: prop.amenities || [],
                            availability: prop.availability || prop.status || 'Available',
                            views: prop.views || prop.view_count || 0,
                            featured: prop.featured || false,
                            verified: prop.verified || prop.is_verified || false,
                        }
                    })
                    .filter(Boolean)
                
                if (isMounted) {
                    setProperties(validProps)
                    setFetchingDetails(false)
                }
            } catch {
                if (isMounted) setFetchingDetails(false)
            }
        }

        fetchPropertyDetails()
        
        return () => {
            isMounted = false
        }
    }, [favoriteIds])

    if (isLoading || fetchingDetails) {
        return (
            <Card>
                <CardContent className="py-8 flex justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </CardContent>
            </Card>
        )
    }

    if (count === 0) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Favorites Yet</h3>
                    <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
                        You haven't favorited any properties yet. Tap the heart icon on properties you like to save them here.
                    </p>
                    <Link href="/search">
                        <Button>Explore Properties</Button>
                    </Link>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Favorites</CardTitle>
                        <CardDescription>
                            {count} {count === 1 ? 'property' : 'properties'} saved
                        </CardDescription>
                    </div>
                    <Button variant="outline" asChild>
                        <Link href="/search">Find More</Link>
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {properties.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        <p>Loading properties...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {properties.map((property) => (
                            <PropertyCard 
                                key={property.id} 
                                property={property}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
