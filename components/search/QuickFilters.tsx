"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { motion } from "framer-motion"

const PG_ROOM_TYPES = ["Single Sharing", "Double Sharing", "Triple Sharing", "Four Sharing"]
const COLIVING_ROOM_TYPES = ["Single Sharing", "Double Sharing"]
const RENT_ROOM_TYPES = ["1 RK", "1 BHK", "2 BHK", "3 BHK", "4 BHK"]

interface QuickFiltersProps {
    gender: "Male" | "Female" | "Couple"
    activeType: "PG" | "Co-living" | "Rent"
    onGenderChange: (value: "Male" | "Female" | "Couple") => void
    priceRange: [number, number]
    onPriceRangeChange: (range: [number, number]) => void
    selectedRoomTypes: string[]
    onToggleRoomType: (type: string) => void
    selectedRoomType?: string
    onRoomTypeChange?: (value: string) => void
}

export function QuickFilters({
    gender,
    activeType,
    onGenderChange,
    priceRange,
    onPriceRangeChange,
    selectedRoomTypes,
    onToggleRoomType,
    selectedRoomType,
    onRoomTypeChange,
}: QuickFiltersProps) {
    // Get room types based on property type
    const getRoomTypes = () => {
        switch(activeType) {
            case 'PG':
                return PG_ROOM_TYPES
            case 'Co-living':
                return COLIVING_ROOM_TYPES
            case 'Rent':
                return RENT_ROOM_TYPES
            default:
                return PG_ROOM_TYPES
        }
    }

    const roomTypes = getRoomTypes()

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Gender Filter - Only for PG/Co-living */}
                {(activeType === "PG" || activeType === "Co-living") && (
                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-2 text-left">
                            Gender
                        </label>
                        <Select value={gender} onValueChange={onGenderChange}>
                            <SelectTrigger className="w-full h-12 bg-gray-50 border-2 border-gray-200 hover:border-primary/40 focus:border-primary text-gray-900">
                                <SelectValue />
                            </SelectTrigger>
                        <SelectContent>
                            {activeType === "Co-living" ? (
                                <>
                                    <SelectItem value="Couple">Couple</SelectItem>
                                    <SelectItem value="Male">Male</SelectItem>
                                    <SelectItem value="Female">Female</SelectItem>
                                </>
                            ) : (
                                <>
                                    <SelectItem value="Male">Male</SelectItem>
                                    <SelectItem value="Female">Female</SelectItem>
                                </>
                            )}
                        </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Room Type - Dropdown for all property types */}
                <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-2 text-left">
                        Room Type
                    </label>
                    <Select 
                        value={selectedRoomType || "all"} 
                        onValueChange={(value) => {
                            if (onRoomTypeChange) {
                                onRoomTypeChange(value === "all" ? "" : value)
                            }
                        }}
                    >
                        <SelectTrigger className="w-full h-12 bg-gray-50 border-2 border-gray-200 hover:border-primary/40 focus:border-primary text-gray-900">
                            <SelectValue placeholder="Select room type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            {roomTypes.map((type) => (
                                <SelectItem key={type} value={type}>
                                    {type}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Price Range - Moved to Quick Filters */}
            <div className="w-full max-w-md">
                <label className="text-sm font-semibold text-gray-700 block mb-2 text-left">
                    Price Range (₹{priceRange[0].toLocaleString()} - ₹{priceRange[1].toLocaleString()})
                </label>
                <Slider
                    min={0}
                    max={50000}
                    step={1000}
                    value={priceRange}
                    onValueChange={(value) => {
                         if (Array.isArray(value) && value.length === 2) {
                             onPriceRangeChange([value[0], value[1]])
                         }
                    }}
                    className="py-4"
                />
            </div>
        </div>
    )
}
