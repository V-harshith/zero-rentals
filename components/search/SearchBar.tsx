"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Search, MapPin } from "lucide-react"
import { generateSessionToken, getPlaceDetailsById } from "@/lib/google-maps-utils"
import { cn } from "@/lib/utils"
import { LocationInput } from "./LocationInput"
import { QuickFilters } from "./QuickFilters"
import { MoreFiltersDropdown } from "./MoreFiltersDropdown"
import { useLocation } from "@/lib/location-context"

const PROPERTY_TYPES = ["PG", "Co-living", "Rent"] as const

interface SearchBarProps {
    className?: string
}

export function SearchBar({ className }: SearchBarProps) {
    const router = useRouter()
    const { userLocation } = useLocation()

    // State
    const [activeType, setActiveType] = useState<"PG" | "Co-living" | "Rent">("PG")
    const [locationValue, setLocationValue] = useState("")
    const [selectedPlace, setSelectedPlace] = useState<{ placeId: string; address: string } | null>(null)
    const [sessionToken] = useState(() => generateSessionToken())

    // Filter State - Gender defaults based on property type
    const [gender, setGender] = useState<"Male" | "Female" | "Any" | "Couple">(
        activeType === "Co-living" ? "Couple" : "Any"
    )

    // Reset gender, room type, and amenities when property type changes
    useEffect(() => {
        setGender(activeType === "Co-living" ? "Couple" : "Any")
        setSelectedRoomType("")
        setSelectedRoomTypes([])
        // Clear "Meals" amenity when switching to Rent
        if (activeType === "Rent") {
            setSelectedAmenities(prev => prev.filter(a => a !== "Meals"))
        }
    }, [activeType])

    // Advanced Filter State
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([])
    const [selectedRoomType, setSelectedRoomType] = useState<string>("")
    const [selectedAmenities, setSelectedAmenities] = useState<string[]>([])
    const [preferredTenant, setPreferredTenant] = useState<string>("Any")
    const [priceRange, setPriceRange] = useState<[number, number]>([0, 50000])
    const [isSearching, setIsSearching] = useState(false)

    const activeFilterCount = selectedRoomTypes.length + selectedAmenities.length +
        (preferredTenant !== "Any" ? 1 : 0)

    // Handlers
    const handleToggleRoomType = (type: string) => {
        setSelectedRoomTypes(prev =>
            prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
        )
    }

    const handleToggleAmenity = (amenity: string) => {
        setSelectedAmenities(prev =>
            prev.includes(amenity) ? prev.filter(a => a !== amenity) : [...prev, amenity]
        )
    }

    const handleClearFilters = () => {
        setSelectedRoomTypes([])
        setSelectedRoomType("")
        setSelectedAmenities([])
        setPreferredTenant("Any")
        setPriceRange([0, 50000])
        setGender("Any")
        // Also clear location
        setLocationValue("")
        setSelectedPlace(null)
    }



    const handleClearLocation = () => {
        setLocationValue("")
        setSelectedPlace(null)
    }

    const handleSearch = async () => {
        setIsSearching(true)
        try {
            const params = new URLSearchParams()
            params.set("type", activeType)

            if (selectedPlace) {
                try {
                    const details = await getPlaceDetailsById(selectedPlace.placeId)
                    if (details) {
                        // CRITICAL FIX: Extract city name for text-based database search
                        // Priority: 1. city from Google API, 2. First part of address (before comma)
                        let locationForSearch = details.city

                        if (!locationForSearch && details.formattedAddress) {
                            // Extract city from formatted address (e.g., "Ahmedabad, Gujarat, India" -> "Ahmedabad")
                            const addressParts = details.formattedAddress.split(',')
                            locationForSearch = addressParts[0]?.trim()
                        }

                        if (locationForSearch) {
                            // Use city name for text search - DO NOT pass lat/lng
                            // This ensures database uses ILIKE matching on city field
                            params.set("location", locationForSearch)
                        } else {
                            // Fallback to geospatial search only if we couldn't extract city name
                            params.set("lat", details.latitude.toString())
                            params.set("lng", details.longitude.toString())
                        }
                    }
                } catch {
                    // If getPlaceDetails fails, fall back to using the location value
                    if (locationValue) {
                        const cleanLocation = locationValue.includes(',')
                            ? locationValue.split(',')[0]?.trim()
                            : locationValue
                        params.set("location", cleanLocation || locationValue)
                    }
                }
            } else if (locationValue) {
                // For manual text input, also extract just the first part if it looks like a full address
                const cleanLocation = locationValue.includes(',')
                    ? locationValue.split(',')[0]?.trim()
                    : locationValue
                params.set("location", cleanLocation || locationValue)
            }

            if (userLocation && !selectedPlace && !locationValue) {
                params.set("lat", userLocation.latitude.toString())
                params.set("lng", userLocation.longitude.toString())
                params.set("useUserLocation", "true")
            }

            // Only apply gender filter for PG/Co-living
            if ((activeType === "PG" || activeType === "Co-living") && gender !== "Any") {
                params.set("gender", gender)
            }

            if (selectedRoomType) {
                params.set("roomType", selectedRoomType)
            }
            if (selectedAmenities.length > 0) {
                params.set("amenities", selectedAmenities.join(","))
            }
            if (preferredTenant !== "Any") {
                params.set("preferredTenant", preferredTenant)
            }

            // Always include price range if not default values
            if (priceRange[0] > 0 || priceRange[1] < 50000) {
                params.set("minPrice", priceRange[0].toString())
                params.set("maxPrice", priceRange[1].toString())
            }

            router.push(`/search?${params.toString()}`)
        } catch {
            // Search failed silently - user can try again
        } finally {
            setIsSearching(false)
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className={cn("w-full mx-auto max-w-5xl will-change-transform translate-z-0", className)}
        >
            {/* Property Type Tabs - Optimized Control Style */}
            <div className="flex justify-center mb-6 sm:mb-8">
                <div className="bg-black/30 backdrop-blur-md p-1 rounded-xl flex border border-white/10">
                    {PROPERTY_TYPES.map((type) => (
                        <button
                            key={type}
                            onClick={() => setActiveType(type)}
                            className={cn(
                                "px-6 sm:px-8 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm font-bold transition-all duration-200 relative",
                                activeType === type
                                    ? "text-gray-900"
                                    : "text-white/70 hover:text-white"
                            )}
                        >
                            {activeType === type && (
                                <motion.div
                                    layoutId="activeTabCompact"
                                    className="absolute inset-0 bg-white rounded-lg shadow-md"
                                    transition={{ type: "tween", duration: 0.2 }}
                                />
                            )}
                            <span className="relative z-10">{type}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Search Container - Optimized Glassmorphic */}
            <motion.div
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="bg-white/95 backdrop-blur-md rounded-[1.5rem] sm:rounded-[2.5rem] p-3 sm:p-5 shadow-2xl border border-white/30"
            >
                <div className="bg-white rounded-[1.25rem] sm:rounded-[2rem] p-5 sm:p-8 space-y-6 sm:space-y-8">
                    {/* Location Row */}
                    <div className="relative">
                        <div className="flex items-center gap-2 mb-2 sm:mb-3">
                            <MapPin className="h-4 w-4 text-primary" />
                            <label className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-gray-500">
                                Where are you looking?
                            </label>
                        </div>
                        <LocationInput
                            value={locationValue}
                            onChange={setLocationValue}
                            onPlaceSelect={setSelectedPlace}
                            sessionToken={sessionToken}
                            onClear={handleClearLocation}
                            placeholder={
                                activeType === "Rent" ? "Indiranagar, Bangalore..." :
                                    activeType === "Co-living" ? "Gurgaon Sector 44..." :
                                        "Koramangala, Bangalore..."
                            }
                        />
                    </div>

                    <div className="h-px bg-gray-100 w-full" />

                    {/* Filters Row */}
                    <div>
                        <QuickFilters
                            gender={gender}
                            activeType={activeType}
                            onGenderChange={setGender}
                            priceRange={priceRange}
                            onPriceRangeChange={setPriceRange}
                            selectedRoomTypes={selectedRoomTypes}
                            onToggleRoomType={handleToggleRoomType}
                            selectedRoomType={selectedRoomType}
                            onRoomTypeChange={setSelectedRoomType}
                        />
                    </div>

                    {/* More Filters - Expandable Section */}
                    <MoreFiltersDropdown
                        selectedAmenities={selectedAmenities}
                        onToggleAmenity={handleToggleAmenity}
                        onClearFilters={handleClearFilters}
                        propertyType={activeType}
                    />

                    {/* Search Button */}
                    <div className="pt-2">
                        <Button
                            className="w-full h-14 sm:h-16 bg-primary hover:bg-primary/95 text-white font-bold text-lg sm:text-xl rounded-xl sm:rounded-2xl transition-all gap-3 active:scale-[0.98]"
                            onClick={handleSearch}
                            disabled={isSearching}
                        >
                            {isSearching ? (
                                <>
                                    <div className="h-5 w-5 sm:h-6 sm:w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                    Searching...
                                </>
                            ) : (
                                <>
                                    <Search className="h-5 w-5 sm:h-6 sm:w-6" />
                                    Search properties
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    )
}
