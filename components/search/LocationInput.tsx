"use client"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { MapPin, Navigation, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useLocation } from "@/lib/location-context"
import {
    getPlaceSuggestions,
    getReverseGeocoding,
    debounce,
    type PlaceSuggestion
} from "@/lib/google-maps-utils"

interface LocationInputProps {
    value: string
    onChange: (value: string) => void
    onPlaceSelect: (place: { placeId: string; address: string }) => void
    sessionToken: string
    placeholder?: string
    onClear?: () => void
}

export function LocationInput({
    value,
    onChange,
    onPlaceSelect,
    sessionToken,
    placeholder = "Enter city, locality or area",
    onClear
}: LocationInputProps) {
    const { userLocation, requestLocation } = useLocation()
    const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [userCleared, setUserCleared] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const suggestionsRef = useRef<HTMLDivElement>(null)
    const isSelectionRef = useRef(false)

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

    const debouncedFetchSuggestions = useRef(
        debounce((input: string) => fetchSuggestions(input), 300)
    ).current

    useEffect(() => {
        if (value) {
            // Check if this update is due to a selection
            if (isSelectionRef.current) {
                isSelectionRef.current = false
                return
            }
            debouncedFetchSuggestions(value)
        }
    }, [value, debouncedFetchSuggestions])

    const handleSelectPlace = (suggestion: PlaceSuggestion) => {
        isSelectionRef.current = true // Flag that this update is a selection
        onChange(suggestion.description)
        onPlaceSelect({
            placeId: suggestion.placeId,
            address: suggestion.description
        })
        setShowSuggestions(false)
        setSuggestions([])
        setUserCleared(false) // User selected a place, allow auto-fill again if they clear later
    }

    const handleUseMyLocation = async () => {
        setUserCleared(false) // User explicitly requested location
        await requestLocation()
    }

    const handleClear = () => {
        onChange("")
        onClear?.()
        setSuggestions([])
        setUserCleared(true) // User explicitly cleared, don't auto-fill
        inputRef.current?.focus()
    }

    // Auto-fill location only if user hasn't manually cleared it
    useEffect(() => {
        const resolveLocation = async () => {
            // Only auto-fill if:
            // 1. User location exists
            // 2. Input is empty
            // 3. User hasn't explicitly cleared the input
            if (userLocation && !value && !userCleared) {
                const lat = userLocation.latitude
                const lng = userLocation.longitude
                // Try reverse geocoding first
                const address = await getReverseGeocoding(lat, lng)
                if (address) {
                    onChange(address)
                } else {
                    // Fallback to coordinates only if reverse geocoding fails
                    onChange(`${lat.toFixed(4)}, ${lng.toFixed(4)}`)
                }
            }
        }
        resolveLocation()
    }, [userLocation, value, userCleared, onChange])

    // Click outside to close
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
        <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary z-10" />
            <Input
                ref={inputRef}
                placeholder={placeholder}
                className="w-full h-14 pl-11 pr-12 bg-gray-50 border-2 border-gray-200 hover:border-primary/40 focus:border-primary text-gray-900 placeholder:text-gray-500 transition-all duration-200"
                value={value}
                onChange={(e) => {
                    const newValue = e.target.value
                    onChange(newValue)
                    // User is manually typing or clearing
                    if (newValue) {
                        setUserCleared(false) // Typing - allow auto-fill if they clear later
                    } else {
                        setUserCleared(true) // Manually cleared by backspace - don't auto-fill
                    }
                }}
                onFocus={() => {
                    if (suggestions.length > 0) {
                        setShowSuggestions(true)
                    }
                }}
            />
            {value ? (
                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all"
                    onClick={handleClear}
                    title="Clear location"
                >
                    <X className="h-4 w-4" />
                </motion.button>
            ) : (
                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-lg text-primary hover:bg-primary/10 transition-colors"
                    onClick={handleUseMyLocation}
                    title="Use my location"
                >
                    <Navigation className="h-4 w-4" />
                </motion.button>
            )}

            {/* Suggestions Dropdown */}
            <AnimatePresence>
                {showSuggestions && suggestions.length > 0 && (
                    <motion.div
                        ref={suggestionsRef}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto"
                    >
                        <motion.button
                            whileHover={{ backgroundColor: "rgba(0,0,0,0.03)" }}
                            className="w-full px-4 py-3 text-left border-b border-gray-100 transition-colors flex items-center gap-2 text-primary font-medium"
                            onClick={handleUseMyLocation}
                        >
                            <Navigation className="h-4 w-4" />
                            Use Current Location
                        </motion.button>
                        {suggestions.map((suggestion) => (
                            <motion.button
                                key={suggestion.placeId}
                                whileHover={{ backgroundColor: "rgba(0,0,0,0.03)" }}
                                className="w-full px-4 py-3 text-left border-b border-gray-100 last:border-0 transition-colors"
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
                            </motion.button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
