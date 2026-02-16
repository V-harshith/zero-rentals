"use client"

import { useState, useEffect, useRef, useCallback } from "react"

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

// Constants for sessionStorage keys
const STORAGE_KEY = 'savedSearchFilters'
const NEW_SEARCH_FLAG = 'newSearchInitiated'
const SESSION_TIMESTAMP_KEY = 'searchSessionTimestamp'
const SESSION_DURATION_MS = 30 * 60 * 1000 // 30 minutes

export default function SearchPage() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const hasRestoredFiltersRef = useRef(false)
    const isNavigatingBackRef = useRef(false)
    const lastSyncedUrlRef = useRef<string>('')

    // Pagination race condition prevention
    const abortControllerRef = useRef<AbortController | null>(null)
    const requestSequenceRef = useRef<number>(0)

    /**
     * Robust URL param parsing with validation
     */
    const parseFilters = useCallback((params: URLSearchParams): SearchFilters => {
        const lat = params.get("lat")
        const lng = params.get("lng")
        const minPrice = params.get("minPrice")
        const maxPrice = params.get("maxPrice")

        // Parse roomType - handle both single value and comma-separated
        let roomType: string[] = []
        const roomTypeParam = params.get("roomType")
        if (roomTypeParam) {
            roomType = roomTypeParam.split(",").filter(Boolean)
        }

        // Parse amenities - handle both single value and comma-separated
        let amenities: string[] = []
        const amenitiesParam = params.get("amenities")
        if (amenitiesParam) {
            amenities = amenitiesParam.split(",").filter(Boolean)
        }

        // Parse sortBy with validation
        const sortByParam = params.get("sortBy")
        const validSortOptions: Array<"date-desc" | "price-asc" | "price-desc" | "popular"> = ["date-desc", "price-asc", "price-desc", "popular"]
        const sortBy: "date-desc" | "price-asc" | "price-desc" | "popular" =
            validSortOptions.includes(sortByParam as "date-desc" | "price-asc" | "price-desc" | "popular")
                ? (sortByParam as "date-desc" | "price-asc" | "price-desc" | "popular")
                : "date-desc"

        return {
            location: params.get("location") || "",
            propertyType: (params.get("type") as SearchFilters['propertyType']) || undefined,
            roomType,
            minPrice: minPrice && !isNaN(parseInt(minPrice)) ? parseInt(minPrice) : 0,
            maxPrice: maxPrice && !isNaN(parseInt(maxPrice)) ? parseInt(maxPrice) : 50000,
            amenities,
            sortBy,
            gender: (params.get("gender") as SearchFilters['gender']) || undefined,
            preferredTenant: params.get("preferredTenant") || undefined,
            lookingFor: (params.get("lookingFor") as SearchFilters['lookingFor']) || undefined,
            useUserLocation: params.get("useUserLocation") === "true",
            coordinates: lat && lng && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng)) ? {
                lat: parseFloat(lat),
                lng: parseFloat(lng)
            } : undefined
        }
    }, [])

    const [filters, setFilters] = useState<SearchFilters>(() => parseFilters(searchParams))

    /**
     * Check if this is a new search session vs. back navigation
     * Uses sessionStorage to track navigation patterns
     */
    const detectNavigationType = useCallback((): { isNewSearch: boolean; isBackNavigation: boolean; savedData: { filters: SearchFilters; timestamp: number; urlParams: string } | null } => {
        // Check for explicit new search flag
        const newSearchFlag = sessionStorage.getItem(NEW_SEARCH_FLAG)
        if (newSearchFlag) {
            sessionStorage.removeItem(NEW_SEARCH_FLAG)
            return { isNewSearch: true, isBackNavigation: false, savedData: null }
        }

        // Check for saved filters
        const savedFiltersRaw = sessionStorage.getItem(STORAGE_KEY)
        if (!savedFiltersRaw) {
            return { isNewSearch: false, isBackNavigation: false, savedData: null }
        }

        try {
            const savedData = JSON.parse(savedFiltersRaw)
            const currentParams = window.location.search
            const currentTimestamp = Date.now()

            // Validate saved data structure
            if (!savedData.filters || !savedData.timestamp) {
                sessionStorage.removeItem(STORAGE_KEY)
                return { isNewSearch: false, isBackNavigation: false, savedData: null }
            }

            // Check if saved within session duration
            const isRecent = currentTimestamp - savedData.timestamp < SESSION_DURATION_MS

            if (!isRecent) {
                // Expired session, clear it
                sessionStorage.removeItem(STORAGE_KEY)
                return { isNewSearch: false, isBackNavigation: false, savedData: null }
            }

            // Detect back navigation: URL params match what was saved
            // (user navigated back to the same search URL)
            const isBackNavigation = currentParams === savedData.urlParams

            return { isNewSearch: false, isBackNavigation, savedData }
        } catch {
            // Invalid JSON, clear it
            sessionStorage.removeItem(STORAGE_KEY)
            return { isNewSearch: false, isBackNavigation: false, savedData: null }
        }
    }, [])

    /**
     * Initialize filters on mount with proper priority:
     * 1. New search from home -> clear filters, use URL params only
     * 2. Back navigation -> restore from sessionStorage
     * 3. Direct URL access -> use URL params
     */
    useEffect(() => {
        if (hasRestoredFiltersRef.current) return

        const { isNewSearch, isBackNavigation, savedData } = detectNavigationType()

        if (isNewSearch) {
            // Clear any stale session data for new searches
            sessionStorage.removeItem(STORAGE_KEY)
            sessionStorage.removeItem(SESSION_TIMESTAMP_KEY)
            // Use URL params as-is (fresh search)
            const freshFilters = parseFilters(searchParams)
            setFilters(freshFilters)
            lastSyncedUrlRef.current = window.location.search
        } else if (isBackNavigation && savedData) {
            // Restore saved filters for back navigation
            isNavigatingBackRef.current = true
            setFilters(savedData.filters)
            lastSyncedUrlRef.current = savedData.urlParams
            // Clear sessionStorage after restoring to prevent stale data
            sessionStorage.removeItem(STORAGE_KEY)
        } else {
            // Direct URL access - use URL params
            const urlFilters = parseFilters(searchParams)
            setFilters(urlFilters)
            lastSyncedUrlRef.current = window.location.search
        }

        hasRestoredFiltersRef.current = true
    }, [searchParams, parseFilters, detectNavigationType])

    /**
     * Handle browser back/forward button (popstate)
     * This catches navigation that doesn't trigger searchParams change
     */
    useEffect(() => {
        const handlePopState = () => {
            // User clicked back/forward button
            const currentParams = new URLSearchParams(window.location.search)
            const newFilters = parseFilters(currentParams)
            setFilters(newFilters)
            lastSyncedUrlRef.current = window.location.search
        }

        window.addEventListener('popstate', handlePopState)
        return () => window.removeEventListener('popstate', handlePopState)
    }, [parseFilters])

    const [filteredProperties, setFilteredProperties] = useState<Property[]>([])
    const [loading, setLoading] = useState(true)
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

    // Track if we're currently syncing to prevent loops
    const isSyncingRef = useRef(false)

    useEffect(() => {
        // Increment request sequence for this fetch
        const currentRequestId = ++requestSequenceRef.current

        // Abort any in-flight request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }

        // Create new abort controller for this request
        const abortController = new AbortController()
        abortControllerRef.current = abortController

        async function fetchProperties() {
            // Set loading state for this specific page change
            setLoading(true)
            try {
                const results = await searchProperties(filters, abortController.signal)

                // Ignore stale responses - only update if this is still the latest request
                if (currentRequestId === requestSequenceRef.current) {
                    setFilteredProperties(results)
                }
            } catch (error) {
                // Ignore abort errors (user navigated away or clicked another page)
                if (error instanceof Error && error.name === 'AbortError') {
                    return
                }

                // Show user-friendly error notification only for latest request
                if (currentRequestId === requestSequenceRef.current) {
                    toast.error("Failed to search properties. Please try again.")
                }
            } finally {
                // Only clear loading state if this is still the latest request
                if (currentRequestId === requestSequenceRef.current) {
                    setLoading(false)
                    abortControllerRef.current = null
                }
            }
        }
        fetchProperties()

        // Cleanup: abort request on unmount or filter change
        return () => {
            abortController.abort()
        }
    }, [filters])

    // Sync URL with filters (only when filters change from user interaction, not from URL/restore)
    const prevFiltersRef = useRef<SearchFilters>(filters)

    useEffect(() => {
        // Skip if we're still initializing or syncing
        if (!hasRestoredFiltersRef.current || isSyncingRef.current) return

        // Skip if this is from back navigation (filters restored from sessionStorage)
        if (isNavigatingBackRef.current) {
            isNavigatingBackRef.current = false
            prevFiltersRef.current = filters
            return
        }

        // Only update URL if filters have actually changed from user interaction
        const prev = prevFiltersRef.current
        const filtersChanged = JSON.stringify(prev) !== JSON.stringify(filters)

        if (!filtersChanged) return

        isSyncingRef.current = true
        prevFiltersRef.current = filters

        const params = new URLSearchParams()
        if (filters.location) params.set("location", filters.location)
        if (filters.propertyType) params.set("type", filters.propertyType)
        if (filters.roomType?.length) params.set("roomType", filters.roomType.join(","))
        if (filters.amenities?.length) params.set("amenities", filters.amenities.join(","))
        // Only set price params if they differ from defaults (minPrice=0, maxPrice=50000)
        if (filters.minPrice !== undefined && filters.minPrice > 0) params.set("minPrice", filters.minPrice.toString())
        if (filters.maxPrice !== undefined && filters.maxPrice < 50000) params.set("maxPrice", filters.maxPrice.toString())
        if (filters.gender) params.set("gender", filters.gender)
        if (filters.preferredTenant) params.set("preferredTenant", filters.preferredTenant)
        if (filters.lookingFor) params.set("lookingFor", filters.lookingFor)
        if (filters.sortBy && filters.sortBy !== "date-desc") params.set("sortBy", filters.sortBy)
        if (filters.useUserLocation) params.set("useUserLocation", "true")
        if (filters.coordinates) {
            params.set("lat", filters.coordinates.lat.toString())
            params.set("lng", filters.coordinates.lng.toString())
        }

        const newUrl = `/search?${params.toString()}`
        const currentFullUrl = window.location.pathname + window.location.search

        // Use replace to avoid history stack spam, but only if URL actually changed
        if (currentFullUrl !== newUrl) {
            router.replace(newUrl, { scroll: false })
            lastSyncedUrlRef.current = params.toString()
        }

        // Reset syncing flag after a short delay
        setTimeout(() => {
            isSyncingRef.current = false
        }, 0)
    }, [filters, router])

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

    /**
     * Clear all filters and reset to defaults
     * Also clears sessionStorage to prevent stale filter restoration
     */
    const clearFilters = useCallback(() => {
        // Set flag to indicate explicit filter clear
        sessionStorage.setItem(NEW_SEARCH_FLAG, 'true')

        const clearedFilters: SearchFilters = {
            location: "",
            propertyType: undefined,
            roomType: [],
            minPrice: 0,
            maxPrice: 50000,
            amenities: [],
            sortBy: "date-desc"
        }
        setFilters(clearedFilters)
        prevFiltersRef.current = clearedFilters

        // Clear session storage
        sessionStorage.removeItem(STORAGE_KEY)
        sessionStorage.removeItem(SESSION_TIMESTAMP_KEY)

        // Clear URL params by navigating to /search
        router.replace('/search', { scroll: false })
        lastSyncedUrlRef.current = ''
    }, [router])

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
                                        priority={index < 2} // Prioritize first 2 images for LCP (above the fold)
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
