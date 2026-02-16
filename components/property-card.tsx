"use client"

import { Property } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MapPin, Heart, Eye, Crown, TrendingUp, Loader2 } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { useAuth } from "@/lib/auth-context"
import { useFavorites } from "@/lib/favorites-context"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useState } from "react"

interface PropertyCardProps {
    property: Property
    showFavorite?: boolean
    priority?: boolean // For LCP optimization on first images
}

export function PropertyCard({ property, showFavorite = true, priority = false }: PropertyCardProps) {
    const { user } = useAuth()
    const router = useRouter()
    const { isFavorite, addFavorite, removeFavorite, isLoading: isFavoritesLoading } = useFavorites()
    const [localLoading, setLocalLoading] = useState(false)

    const favorite = isFavorite(property.id)

    const toggleFavorite = async (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()

        // Check if user is logged in
        if (!user) {
            toast.error("Please login to save favorites")
            router.push("/login/tenant")
            return
        }

        // Don't allow toggling while already processing
        if (localLoading) {
            return
        }

        setLocalLoading(true)

        try {
            if (favorite) {
                await removeFavorite(property.id)
            } else {
                await addFavorite(property.id)
            }
        } finally {
            setLocalLoading(false)
        }
    }

    const handleCardClick = (e: React.MouseEvent) => {
        // Save current URL (with all search params) to sessionStorage before navigating
        const currentUrl = window.location.pathname + window.location.search
        if (currentUrl.startsWith('/search')) {
            const searchParams = new URLSearchParams(window.location.search)
            const filters: Record<string, unknown> = {
                location: searchParams.get("location") || "",
                propertyType: searchParams.get("type") || undefined,
                roomType: searchParams.getAll("roomType").length > 0 ? searchParams.getAll("roomType")[0].split(",") : [],
                minPrice: searchParams.get("minPrice") ? parseInt(searchParams.get("minPrice")!) : 0,
                maxPrice: searchParams.get("maxPrice") ? parseInt(searchParams.get("maxPrice")!) : 50000,
                amenities: searchParams.getAll("amenities").length > 0 ? searchParams.getAll("amenities")[0].split(",") : [],
                sortBy: "date-desc",
                gender: searchParams.get("gender") || undefined,
                preferredTenant: searchParams.get("preferredTenant") || undefined,
                lookingFor: searchParams.get("lookingFor") || undefined,
                useUserLocation: searchParams.get("useUserLocation") === "true",
            }
            const lat = searchParams.get("lat")
            const lng = searchParams.get("lng")
            if (lat && lng) {
                filters.coordinates = { lat: parseFloat(lat), lng: parseFloat(lng) }
            }
            sessionStorage.setItem('savedSearchFilters', JSON.stringify({
                filters,
                timestamp: Date.now()
            }))
        }
    }

    return (
        <Link href={`/property/${property.id}`} onClick={handleCardClick}>
            <Card className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer h-full flex flex-col overflow-hidden">
                <CardContent className="p-0 flex flex-col h-full">
                    {/* Image */}
                    <div className="relative h-48 w-full bg-gray-200 shrink-0 overflow-hidden">
                        {property?.images && property.images.length > 0 ? (
                            <Image
                                src={property.images[0]}
                                alt={property.title}
                                fill
                                className="object-cover transition-transform duration-300 group-hover:scale-105"
                                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                                priority={priority}
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-gray-400 text-sm">No Image</span>
                            </div>
                        )}

                        {/* Badges */}
                        <div className="absolute top-3 left-3 flex gap-2 z-10">
                            <Badge className="bg-primary text-primary-foreground">
                                {property?.propertyType || "Property"}
                            </Badge>
                            {property?.featured && (
                                <Badge className="bg-gradient-to-r from-yellow-400 to-amber-500 text-white border-0 gap-1 shadow-lg">
                                    <Crown className="h-3 w-3" />
                                    Featured
                                </Badge>
                            )}
                            {property?.verified && (
                                <Badge className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-0 gap-1 shadow-lg">
                                    ✓ Verified
                                </Badge>
                            )}
                        </div>

                        {/* Trending Badge (for high views) */}
                        {(property?.views || 0) > 100 && (
                            <div className="absolute top-3 right-3 z-10">
                                <Badge className="bg-gradient-to-r from-orange-500 to-red-500 text-white border-0 gap-1 shadow-lg animate-pulse">
                                    <TrendingUp className="h-3 w-3" />
                                    Hot
                                </Badge>
                            </div>
                        )}


                        {/* Favorite Button - Tenants Only */}
                        {showFavorite && user?.role === 'tenant' && (
                            <button
                                onClick={toggleFavorite}
                                disabled={localLoading}
                                className={`
                                    absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center
                                    transition-all z-10
                                    bg-white/90 hover:bg-white hover:scale-110
                                    ${localLoading ? 'opacity-70 cursor-not-allowed' : ''}
                                `}
                                aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
                                title={favorite ? "Remove from favorites" : "Add to favorites"}
                            >
                                {localLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
                                ) : (
                                    <Heart
                                        className={`h-4 w-4 transition-all ${favorite ? "fill-red-500 text-red-500" : "text-gray-600"
                                            }`}
                                    />
                                )}
                            </button>
                        )}

                        {/* Availability Badge */}
                        <div className="absolute bottom-3 right-3 z-10">
                            <Badge
                                variant={property?.availability === "Available" ? "default" : "secondary"}
                                className={
                                    property.availability === "Available"
                                        ? "bg-green-500 hover:bg-green-600"
                                        : "bg-gray-500"
                                }
                            >
                                {property.availability}
                            </Badge>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-4 space-y-3">
                        {/* Title */}
                        <h3 className="font-semibold text-lg line-clamp-1 group-hover:text-primary transition-colors">
                            {property?.title || "Untitled Property"}
                        </h3>

                        {/* Location */}
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span className="line-clamp-1">
                                {property.location?.area || "Unknown Area"}, {property.location?.city || "Unknown City"}
                            </span>
                        </div>

                        {/* Price & Room Type */}
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-lg sm:text-xl font-bold text-primary">
                                    <span className="text-primary font-bold">₹{(property?.price || 0).toLocaleString()}</span>
                                </div>
                                <div className="text-xs text-muted-foreground">per month</div>
                            </div>
                            <div className="flex flex-wrap gap-1 justify-end">
                                {property.roomPrices?.['1rk'] && (
                                    <Badge variant="outline">1RK</Badge>
                                )}
                                {property.roomPrices?.single && !property.roomPrices?.['1rk'] && (
                                    <Badge variant="outline">
                                        {property.propertyType === 'Rent' ? '1BHK' : 'Single'}
                                    </Badge>
                                )}
                                {property.roomPrices?.double && (
                                    <Badge variant="outline">
                                        {property.propertyType === 'Rent' ? '2BHK' : 'Double'}
                                    </Badge>
                                )}
                                {property.roomPrices?.triple && (
                                    <Badge variant="outline">
                                        {property.propertyType === 'Rent' ? '3BHK' : 'Triple'}
                                    </Badge>
                                )}
                                {property.roomPrices?.four && (
                                    <Badge variant="outline">
                                        {property.propertyType === 'Rent' ? '4BHK+' : 'Four'}
                                    </Badge>
                                )}
                            </div>
                        </div>

                        {/* Amenities */}
                        <div className="flex flex-wrap gap-1">
                            {(property.amenities || []).slice(0, 3).map((amenity, index) => (
                                <span
                                    key={index}
                                    className="text-xs px-2 py-1 bg-muted rounded-md"
                                >
                                    {amenity}
                                </span>
                            ))}
                            {(property.amenities || []).length > 3 && (
                                <span className="text-xs px-2 py-1 bg-muted rounded-md">
                                    +{(property.amenities || []).length - 3} more
                                </span>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-2 border-t">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Eye className="h-3 w-3" />
                                <span>{property.views} views</span>
                            </div>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="text-primary hover:text-primary hover:bg-primary/10"
                            >
                                View Details →
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}
