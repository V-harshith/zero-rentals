"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { motion } from "framer-motion"

const ALL_AMENITIES = ["WiFi", "AC", "Parking", "Gym", "Security", "Laundry", "Meals"]

// Rent properties exclude PG-specific services
const RENT_EXCLUDED_AMENITIES = ["Meals"]

interface AdvancedFiltersProps {
    selectedAmenities: string[]
    activeFilterCount: number
    onToggleAmenity: (amenity: string) => void
    onClearFilters: () => void
    propertyType?: "PG" | "Co-living" | "Rent"
}

export function AdvancedFilters({
    selectedAmenities,
    activeFilterCount,
    onToggleAmenity,
    onClearFilters,
    propertyType = "PG"
}: AdvancedFiltersProps) {
    // Filter amenities based on property type
    const getAmenities = () => {
        if (propertyType === "Rent") {
            return ALL_AMENITIES.filter(a => !RENT_EXCLUDED_AMENITIES.includes(a))
        }
        return ALL_AMENITIES
    }

    const amenities = getAmenities()

    return (
        <div className="space-y-4">
            {/* Amenities */}
            <div className="space-y-3">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="text-lg">✨</span>
                    Amenities
                </label>
                <div className="flex flex-wrap gap-2">
                    {amenities.map((amenity) => (
                        <motion.div
                            key={amenity}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <Badge
                                variant={selectedAmenities.includes(amenity) ? "default" : "outline"}
                                className="cursor-pointer px-4 py-2 text-sm"
                                onClick={() => onToggleAmenity(amenity)}
                            >
                                {amenity}
                            </Badge>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Clear Filters - Only show if filters are active */}
            {activeFilterCount > 0 && (
                <div className="flex justify-end pt-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 text-gray-600 hover:text-red-600 hover:border-red-500 hover:bg-red-50"
                        onClick={onClearFilters}
                    >
                        <X className="h-4 w-4" />
                        Clear Filters ({activeFilterCount})
                    </Button>
                </div>
            )}
        </div>
    )
}
