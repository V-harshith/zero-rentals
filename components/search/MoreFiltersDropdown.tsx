"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SlidersHorizontal, ChevronDown, ChevronUp, Wifi, Snowflake, Car, Dumbbell, Shield, WashingMachine, Utensils } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

const ALL_AMENITIES = [
    { id: 'WiFi', label: 'WiFi', icon: Wifi },
    { id: 'AC', label: 'AC', icon: Snowflake },
    { id: 'Parking', label: 'Parking', icon: Car },
    { id: 'Gym', label: 'Gym', icon: Dumbbell },
    { id: 'Security', label: 'Security', icon: Shield },
    { id: 'Laundry', label: 'Laundry', icon: WashingMachine },
    { id: 'Meals', label: 'Meals', icon: Utensils }
]

// Rent properties exclude PG-specific services
const RENT_EXCLUDED_AMENITIES = ["Meals"]

interface MoreFiltersDropdownProps {
    selectedAmenities: string[]
    onToggleAmenity: (amenityId: string) => void
    onClearFilters: () => void
    propertyType?: "PG" | "Co-living" | "Rent"
}

export function MoreFiltersDropdown({
    selectedAmenities,
    onToggleAmenity,
    onClearFilters,
    propertyType = "PG"
}: MoreFiltersDropdownProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    const activeFiltersCount = selectedAmenities.length

    // Filter amenities based on property type
    const getAmenities = () => {
        if (propertyType === "Rent") {
            return ALL_AMENITIES.filter(a => !RENT_EXCLUDED_AMENITIES.includes(a.id))
        }
        return ALL_AMENITIES
    }

    const amenities = getAmenities()

    return (
        <div className="space-y-3">
            {/* More Filters Button */}
            <div className="flex items-center justify-between">
                <Button
                    variant="outline"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="gap-2 h-12 px-6 border-2 border-gray-200 hover:border-primary hover:bg-primary/10 hover:text-primary transition-colors"
                >
                    <SlidersHorizontal className="h-4 w-4" />
                    <span className="font-semibold">More Filters</span>
                    {activeFiltersCount > 0 && (
                        <Badge variant="secondary" className="ml-1 h-5 px-2">
                            {activeFiltersCount}
                        </Badge>
                    )}
                    {isExpanded ? (
                        <ChevronUp className="h-4 w-4 ml-1" />
                    ) : (
                        <ChevronDown className="h-4 w-4 ml-1" />
                    )}
                </Button>

                {activeFiltersCount > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClearFilters}
                        className="text-gray-600 hover:text-red-600"
                    >
                        Clear All
                    </Button>
                )}
            </div>

            {/* Expandable Amenities Section */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-gray-50 rounded-xl p-4 border-2 border-gray-200">
                            <label className="text-sm font-semibold text-gray-700 block mb-3 flex items-center gap-2">
                                <span className="text-lg">✨</span>
                                Amenities
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {amenities.map((amenity) => {
                                    const Icon = amenity.icon
                                    return (
                                        <motion.div
                                            key={amenity.id}
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                        >
                                            <Badge
                                                variant={selectedAmenities.includes(amenity.id) ? "default" : "outline"}
                                                className="cursor-pointer px-4 py-2 text-sm flex items-center gap-1.5"
                                                onClick={() => onToggleAmenity(amenity.id)}
                                            >
                                                <Icon className="h-3.5 w-3.5" />
                                                {amenity.label}
                                            </Badge>
                                        </motion.div>
                                    )
                                })}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
