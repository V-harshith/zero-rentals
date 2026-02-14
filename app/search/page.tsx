"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { searchProperties } from "@/lib/data-service"
import { SearchFilters } from "@/lib/types"
import type { Property } from "@/lib/types"
import { PropertyCard } from "@/components/property-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Slider } from "@/components/ui/slider"
import { Filter, X, Search, ArrowLeft } from "lucide-react"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { LocationPermissionModal } from "@/components/location-permission-modal"
import { toast } from "sonner"

export default function SearchPage() {
    const searchParams = useSearchParams()
    const isUpdatingFromUrl = useRef(false)
    const parseFilters = (params: URLSearchParams): SearchFilters => {
        const lat = params.get("lat")
        const lng = params.get("lng")
        const minPrice = params.get("minPrice")
        const maxPrice = params.get("maxPrice")

        return {
            location: params.get("location") || "",
            propertyType: (params.get("type") as SearchFilters['propertyType']) || undefined,
            roomType: params.getAll("roomType").length > 0 ? params.getAll("roomType")[0].split(",") : [],
            minPrice: minPrice && !isNaN(parseInt(minPrice)) ? parseInt(minPrice) : 0,
            maxPrice: maxPrice && !isNaN(parseInt(maxPrice)) ? parseInt(maxPrice) : 50000,
            amenities: params.getAll("amenities").length > 0 ? params.getAll("amenities")[0].split(",") : [],
            sortBy: "date-desc",
            gender: (params.get("gender") as SearchFilters['gender']) || undefined,
            preferredTenant: params.get("preferredTenant") || undefined,
            lookingFor: (params.get("lookingFor") as SearchFilters['lookingFor']) || undefined,
            useUserLocation: params.get("useUserLocation") === "true",
            coordinates: lat && lng ? {
                lat: parseFloat(lat),
                lng: parseFloat(lng)
            } : undefined
        }
    }

    const [filters, setFilters] = useState<SearchFilters>(() => parseFilters(searchParams))

    const [filteredProperties, setFilteredProperties] = useState<Property[]>([])
    const [loading, setLoading] = useState(true)
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

    useEffect(() => {
        let isMounted = true
        async function fetchProperties() {
            setLoading(true)
            try {
                const results = await searchProperties(filters)
                if (isMounted) setFilteredProperties(results)
            } catch {
                // Show user-friendly error notification
                if (isMounted) {
                    toast.error("Failed to search properties. Please try again.")
                }
            } finally {
                if (isMounted) setLoading(false)
            }
        }
        fetchProperties()
        return () => { isMounted = false }
    }, [filters])

    // Sync URL with filters
    const router = useRouter()
    useEffect(() => {
        // Prevent circular updates when reading from URL
        if (isUpdatingFromUrl.current) {
            isUpdatingFromUrl.current = false
            return
        }

        const params = new URLSearchParams()
        if (filters.location) params.set("location", filters.location)
        if (filters.propertyType) params.set("type", filters.propertyType)
        if (filters.roomType?.length) params.set("roomType", filters.roomType.join(","))
        if (filters.amenities?.length) params.set("amenities", filters.amenities.join(","))
        if (filters.minPrice) params.set("minPrice", filters.minPrice.toString())
        if (filters.maxPrice) params.set("maxPrice", filters.maxPrice.toString())
        if (filters.gender) params.set("gender", filters.gender)
        if (filters.preferredTenant) params.set("preferredTenant", filters.preferredTenant)
        if (filters.lookingFor) params.set("lookingFor", filters.lookingFor)
        if (filters.useUserLocation) params.set("useUserLocation", "true")
        if (filters.coordinates) {
            params.set("lat", filters.coordinates.lat.toString())
            params.set("lng", filters.coordinates.lng.toString())
        }

        // Use replace to avoid history stack spam
        router.replace(`/search?${params.toString()}`, { scroll: false })
    }, [filters, router])

    // Listen for URL changes (back/forward navigation)
    useEffect(() => {
        const handlePopState = () => {
            isUpdatingFromUrl.current = true
            setFilters(parseFilters(searchParams))
        }
        window.addEventListener('popstate', handlePopState)
        return () => window.removeEventListener('popstate', handlePopState)
    }, [searchParams])

    const updateFilter = (key: keyof SearchFilters, value: any) => {
        setFilters(prev => {
            const newFilters = { ...prev, [key]: value }
            // Clear "Meals" amenity when switching to Rent property type
            if (key === 'propertyType' && value === 'Rent' && prev.amenities?.includes('Meals')) {
                newFilters.amenities = prev.amenities.filter(a => a !== 'Meals')
            }
            return newFilters
        })
    }

    const toggleRoomType = (roomType: string) => {
        setFilters(prev => ({
            ...prev,
            roomType: prev.roomType?.includes(roomType)
                ? prev.roomType.filter(t => t !== roomType)
                : [...(prev.roomType || []), roomType]
        }))
    }

    const toggleAmenity = (amenity: string) => {
        setFilters(prev => ({
            ...prev,
            amenities: prev.amenities?.includes(amenity)
                ? prev.amenities.filter(a => a !== amenity)
                : [...(prev.amenities || []), amenity]
        }))
    }

    const clearFilters = () => {
        setFilters({
            location: "",
            propertyType: undefined,
            roomType: [],
            minPrice: 0,
            maxPrice: 50000,
            amenities: [],
            sortBy: "date-desc"
        })
    }

    const getRoomTypes = () => {
        if (filters.propertyType === "Rent") {
            return ["1 RK", "1 BHK", "2 BHK", "3 BHK", "4 BHK"]
        }
        if (filters.propertyType === "Co-living") {
            return ["Single", "Double"]
        }
        // Default to PG types
        return ["Single", "Double", "Triple", "Four Sharing"]
    }

    const getGenderOptions = () => {
        if (filters.propertyType === "Co-living") {
            return ["Couple", "Male", "Female"]
        }
        // For PG and Rent
        return ["Male", "Female"]
    }

    const renderFilters = () => (
        <div className="space-y-6">
            {/* Location */}
            <div className="space-y-2">
                <Label>Location</Label>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by city, area, locality, or pincode"
                        value={filters.location}
                        onChange={(e) => updateFilter("location", e.target.value)}
                        className="pl-10"
                    />
                </div>
            </div>

            {/* Property Type */}
            <div className="space-y-2">
                <Label>Property Type</Label>
                <Select
                    value={filters.propertyType}
                    onValueChange={(value) => updateFilter("propertyType", value === "all" ? undefined : value)}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="PG">PG</SelectItem>
                        <SelectItem value="Co-living">Co-living</SelectItem>
                        <SelectItem value="Rent">Rent</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Room Type */}
            <div className="space-y-2">
                <Label>Room Type</Label>
                <div className="space-y-2">
                    {getRoomTypes().map((type) => (
                        <div key={type} className="flex items-center space-x-2">
                            <Checkbox
                                id={`room-${type}`}
                                checked={filters.roomType?.includes(type)}
                                onCheckedChange={() => toggleRoomType(type)}
                            />
                            <label htmlFor={`room-${type}`} className="text-sm cursor-pointer">
                                {type}
                            </label>
                        </div>
                    ))}
                </div>
            </div>

            {/* Price Range */}
            <div className="space-y-2">
                <Label>Price Range</Label>
                <div className="space-y-4">
                    <Slider
                        min={0}
                        max={50000}
                        step={1000}
                        value={[filters.minPrice || 0, filters.maxPrice || 50000]}
                        onValueChange={([min, max]) => {
                            updateFilter("minPrice", min)
                            updateFilter("maxPrice", max)
                        }}
                    />
                    <div className="flex items-center gap-2 text-sm">
                        <span>₹{filters.minPrice?.toLocaleString()}</span>
                        <span>-</span>
                        <span>₹{filters.maxPrice?.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            {/* Gender Preference */}
            {filters.propertyType && (
                <div className="space-y-2">
                    <Label>Gender Preference</Label>
                    <Select
                        value={filters.gender || getGenderOptions()[0]}
                        onValueChange={(value) => updateFilter("gender", value)}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {getGenderOptions().map((option) => (
                                <SelectItem key={option} value={option}>
                                    {option}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {/* Amenities */}
            <div className="space-y-2">
                <Label>Amenities</Label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                    {(() => {
                        // Filter amenities based on property type
                        const allAmenities = ["WiFi", "AC", "Parking", "Gym", "Security", "Laundry", "Meals"]
                        const rentExcluded = ["Meals"]
                        const amenitiesToShow = filters.propertyType === "Rent"
                            ? allAmenities.filter(a => !rentExcluded.includes(a))
                            : allAmenities
                        return amenitiesToShow.map((amenity) => (
                            <div key={amenity} className="flex items-center space-x-2">
                                <Checkbox
                                    id={`amenity-${amenity}`}
                                    checked={filters.amenities?.includes(amenity)}
                                    onCheckedChange={() => toggleAmenity(amenity)}
                                />
                                <label htmlFor={`amenity-${amenity}`} className="text-sm cursor-pointer">
                                    {amenity}
                                </label>
                            </div>
                        ))
                    })()}
                </div>
            </div>

            {/* Clear Filters */}
            <Button variant="outline" className="w-full" onClick={clearFilters}>
                <X className="h-4 w-4 mr-2" />
                Clear All Filters
            </Button>
        </div>
    )

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <Header />
            <div className="container mx-auto px-4 py-8 flex-1">
                {/* Header */}
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">Search Properties</h1>
                        <p className="text-muted-foreground">
                            Found {filteredProperties.length} properties
                        </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => router.push('/')} className="gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Home
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Desktop Filters */}
                    <div className="hidden lg:block">
                        <Card className="sticky top-4">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Filter className="h-5 w-5" />
                                    Filters
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {renderFilters()}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Results */}
                    <div className="lg:col-span-3 space-y-6">
                        {/* Mobile Filter Button & Sort */}
                        <div className="flex items-center justify-between gap-4">
                            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                                <SheetTrigger asChild>
                                    <Button variant="outline" className="lg:hidden">
                                        <Filter className="h-4 w-4 mr-2" />
                                        Filters
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="left" className="w-80 overflow-y-auto">
                                    <SheetHeader>
                                        <SheetTitle>Filters</SheetTitle>
                                    </SheetHeader>
                                    <div className="mt-6">
                                        {renderFilters()}
                                    </div>
                                </SheetContent>
                            </Sheet>

                            {/* Sort */}
                            <div className="flex items-center gap-2 flex-1 justify-end">
                                <Label className="text-sm">Sort by:</Label>
                                <Select
                                    value={filters.sortBy}
                                    onValueChange={(value: any) => updateFilter("sortBy", value)}
                                >
                                    <SelectTrigger className="w-40">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="date-desc">Newest First</SelectItem>
                                        <SelectItem value="price-asc">Price: Low to High</SelectItem>
                                        <SelectItem value="price-desc">Price: High to Low</SelectItem>
                                        <SelectItem value="popular">Most Popular</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Property Grid */}
                        {loading ? (
                            <div className="text-center py-12">
                                <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                                <p className="text-muted-foreground">Searching properties...</p>
                            </div>
                        ) : filteredProperties.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {filteredProperties.map((property, index) => (
                                    <PropertyCard
                                        key={property.id}
                                        property={property}
                                        priority={index < 6} // Prioritize first 6 images for LCP
                                    />
                                ))}
                            </div>
                        ) : (
                            <Card>
                                <CardContent className="py-12 text-center">
                                    <p className="text-lg text-muted-foreground mb-4">
                                        No properties found matching your criteria
                                    </p>
                                    <Button onClick={clearFilters}>Clear Filters</Button>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
            <Footer />
            <LocationPermissionModal />
        </div >
    )
}
