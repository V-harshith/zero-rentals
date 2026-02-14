"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { MapPin, Search, Navigation, ChevronDown } from "lucide-react"
import { useLocation } from "@/lib/location-context"
import { getPlaceSuggestions, getPlaceDetailsById, generateSessionToken, debounce, type PlaceSuggestion } from "@/lib/google-maps-utils"
import { cn } from "@/lib/utils"

const PROPERTY_TYPES = ["PG", "Co-living", "Rent"] as const

interface EnhancedSearchBarProps {
    className?: string
}

export function EnhancedSearchBar({ className }: EnhancedSearchBarProps) {
    const router = useRouter()
    const { userLocation, requestLocation, locationPermission } = useLocation()
    const [activeType, setActiveType] = useState<"PG" | "Co-living" | "Rent">("PG")

    // Search state
    const [locationInput, setLocationInput] = useState("")
    const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [selectedPlace, setSelectedPlace] = useState<{ placeId: string; address: string } | null>(null)
    const [sessionToken] = useState(() => generateSessionToken())

    // Filter state - Gender defaults based on property type
    const [gender, setGender] = useState<"Male" | "Female" | "Couple" | "Any">(
        activeType === "Co-living" ? "Couple" : "Any"
    )
    const [lookingFor, setLookingFor] = useState<"PG" | "Room/Bed">("PG")
    const [budget, setBudget] = useState<string>("10k-20k")

    // Reset gender when property type changes
    useEffect(() => {
        setGender(activeType === "Co-living" ? "Couple" : "Any")
    }, [activeType])

    const inputRef = useRef<HTMLInputElement>(null)
    const suggestionsRef = useRef<HTMLDivElement>(null)

    // Fetch autocomplete suggestions
    const fetchSuggestions = async (input: string) => {
        if (input.length < 3) {
            setSuggestions([])
            return
        }

        const results = await getPlaceSuggestions(input, sessionToken)
        setSuggestions(results)
        setShowSuggestions(true)
    }

    // Debounced search
    const debouncedFetchSuggestions = useRef(
        debounce((input: string) => fetchSuggestions(input), 300)
    ).current

    useEffect(() => {
        if (locationInput && !selectedPlace) {
            debouncedFetchSuggestions(locationInput)
        }
    }, [locationInput, selectedPlace, debouncedFetchSuggestions])

    // Handle place selection
    const handleSelectPlace = async (suggestion: PlaceSuggestion) => {
        setLocationInput(suggestion.description)
        setSelectedPlace({ placeId: suggestion.placeId, address: suggestion.description })
        setShowSuggestions(false)
        setSuggestions([])
    }

    // Handle location button click
    const handleUseMyLocation = async () => {
        await requestLocation()
    }

    // Auto-fill location when user location is available
    useEffect(() => {
        if (userLocation && !locationInput) {
            // Use reverse geocoding to get address
            const lat = userLocation.latitude
            const lng = userLocation.longitude
            setLocationInput(`${lat.toFixed(4)}, ${lng.toFixed(4)}`)
        }
    }, [userLocation])

    // Handle search
    const handleSearch = async () => {
        const params = new URLSearchParams()

        // Property type
        params.set("type", activeType)

        // Location
        if (selectedPlace) {
            const details = await getPlaceDetailsById(selectedPlace.placeId)
            if (details) {
                params.set("location", details.city || details.formattedAddress)
                params.set("lat", details.latitude.toString())
                params.set("lng", details.longitude.toString())
            }
        } else if (locationInput) {
            params.set("location", locationInput)
        }

        // Use user location if available and no location selected
        if (userLocation && !selectedPlace && !locationInput) {
            params.set("lat", userLocation.latitude.toString())
            params.set("lng", userLocation.longitude.toString())
            params.set("useUserLocation", "true")
        }

        // Filters
        if (gender !== "Couple") params.set("gender", gender)
        if (lookingFor) params.set("lookingFor", lookingFor)

        // Budget to price range
        const budgetMap: Record<string, { min: number; max: number }> = {
            "5k-10k": { min: 5000, max: 10000 },
            "10k-20k": { min: 10000, max: 20000 },
            "20k-30k": { min: 20000, max: 30000 },
            "30k+": { min: 30000, max: 100000 },
        }
        const range = budgetMap[budget]
        if (range) {
            params.set("minPrice", range.min.toString())
            params.set("maxPrice", range.max.toString())
        }

        router.push(`/search?${params.toString()}`)
    }

    // Close suggestions when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                suggestionsRef.current &&
                !suggestionsRef.current.contains(event.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(event.target as Node)
            ) {
                setShowSuggestions(false)
            }
        }

        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    return (
        <div className={cn("w-full", className)}>
            {/* Property Type Tabs */}
            <div className="flex flex-wrap justify-center gap-3 mb-6 animate-slideUp" style={{ animationDelay: "0.1s" }}>
                {PROPERTY_TYPES.map((type) => (
                    <Button
                        key={type}
                        size="lg"
                        className={`${activeType === type
                            ? "bg-white text-primary shadow-lg hover:bg-white/90"
                            : "bg-white/10 text-white border-2 border-white/30 hover:bg-white/20 hover:border-white/50"
                            } transition-all duration-300 px-8 py-6 font-semibold text-base`}
                        onClick={() => setActiveType(type)}
                    >
                        {type}
                    </Button>
                ))}
            </div>

            {/* Search Form */}
            <div
                className="bg-white rounded-2xl p-6 md:p-8 shadow-2xl animate-scaleIn"
                style={{ animationDelay: "0.2s" }}
            >
                <div className="grid grid-cols-1 gap-4 items-end md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                    {/* Location Input with Autocomplete */}
                    <div className="relative">
                        <label className="text-sm font-semibold text-gray-700 block mb-2 text-left">
                            Location
                        </label>
                        <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary z-10" />
                            <Input
                                ref={inputRef}
                                placeholder="Enter city, locality or area"
                                className="w-full h-14 pl-11 pr-12 bg-gray-50 border-2 border-gray-200 hover:border-primary/40 focus:border-primary text-gray-900 placeholder:text-gray-500"
                                value={locationInput}
                                onChange={(e) => {
                                    setLocationInput(e.target.value)
                                    setSelectedPlace(null)
                                }}
                                onFocus={() => {
                                    if (suggestions.length > 0) {
                                        setShowSuggestions(true)
                                    }
                                }}
                            />
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 text-primary hover:bg-primary/10"
                                onClick={handleUseMyLocation}
                                title="Use my location"
                            >
                                <Navigation className="h-4 w-4" />
                            </Button>

                            {/* Autocomplete Suggestions */}
                            {showSuggestions && suggestions.length > 0 && (
                                <div
                                    ref={suggestionsRef}
                                    className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto"
                                >
                                    {suggestions.map((suggestion) => (
                                        <button
                                            key={suggestion.placeId}
                                            className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors"
                                            onClick={() => handleSelectPlace(suggestion)}
                                        >
                                            <div className="flex items-start gap-2">
                                                <MapPin className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-gray-900 truncate">
                                                        {suggestion.mainText}
                                                    </div>
                                                    <div className="text-sm text-gray-500 truncate">
                                                        {suggestion.secondaryText}
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Gender Filter */}
                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-2 text-left">
                            Gender
                        </label>
                        <Select value={gender} onValueChange={(value: any) => setGender(value)}>
                            <SelectTrigger className="w-full h-14 bg-gray-50 border-2 border-gray-200 hover:border-primary/40 focus:border-primary text-gray-900">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Couple">Couple</SelectItem>
                                <SelectItem value="Male">Male</SelectItem>
                                <SelectItem value="Female">Female</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Looking For Filter */}
                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-2 text-left">
                            Looking For
                        </label>
                        <Select value={lookingFor} onValueChange={(value: any) => setLookingFor(value)}>
                            <SelectTrigger className="w-full h-14 bg-gray-50 border-2 border-gray-200 hover:border-primary/40 focus:border-primary text-gray-900">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="PG">PG</SelectItem>
                                <SelectItem value="Room/Bed">Room/Bed in Shared-Flat</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Budget Filter */}
                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-2 text-left">
                            Budget
                        </label>
                        <Select value={budget} onValueChange={setBudget}>
                            <SelectTrigger className="w-full h-14 bg-gray-50 border-2 border-gray-200 hover:border-primary/40 focus:border-primary text-gray-900">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="5k-10k">₹5,000 - ₹10,000</SelectItem>
                                <SelectItem value="10k-20k">₹10,000 - ₹20,000</SelectItem>
                                <SelectItem value="20k-30k">₹20,000 - ₹30,000</SelectItem>
                                <SelectItem value="30k+">₹30,000+</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Search Button */}
                    <div>
                        <Button
                            className="w-full h-14 bg-accent hover:bg-accent/90 text-white font-semibold transition-all hover:scale-105 whitespace-nowrap"
                            onClick={handleSearch}
                        >
                            <Search className="h-5 w-5 mr-2" />
                            Search
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
