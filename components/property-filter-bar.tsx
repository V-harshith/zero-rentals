"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { X, SlidersHorizontal, Search } from "lucide-react"
import { Card } from "@/components/ui/card"

export interface FilterOptions {
    city?: string
    area?: string
    minPrice?: number
    maxPrice?: number
    roomType?: string[]
    amenities?: string[]
    preferredTenant?: string
}

interface PropertyFilterBarProps {
    onFilterChange: (filters: FilterOptions) => void
    cities?: string[]
    amenities?: string[]
}

const ROOM_TYPES = ["Single", "Double", "Triple", "Four Sharing", "Apartment"]
const TENANT_PREFERENCES = ["Any", "Male", "Female", "Gents", "Ladies"]

export function PropertyFilterBar({
    onFilterChange,
    cities = [],
    amenities = [],
}: PropertyFilterBarProps) {
    const [showFilters, setShowFilters] = useState(false)
    const [filters, setFilters] = useState<FilterOptions>({
        minPrice: 0,
        maxPrice: 100000,
        roomType: [],
        amenities: [],
    })

    const updateFilter = (key: keyof FilterOptions, value: any) => {
        const newFilters = { ...filters, [key]: value }
        setFilters(newFilters)
        onFilterChange(newFilters)
    }

    const toggleArrayFilter = (key: "roomType" | "amenities", value: string) => {
        const currentArray = filters[key] || []
        const newArray = currentArray.includes(value)
            ? currentArray.filter((item) => item !== value)
            : [...currentArray, value]
        updateFilter(key, newArray)
    }

    const clearFilters = () => {
        const clearedFilters: FilterOptions = {
            city: undefined,
            area: undefined,
            minPrice: 0,
            maxPrice: 100000,
            roomType: [],
            amenities: [],
            preferredTenant: undefined,
        }
        setFilters(clearedFilters)
        onFilterChange(clearedFilters)
    }

    const activeFilterCount =
        (filters.city ? 1 : 0) +
        (filters.area ? 1 : 0) +
        (filters.roomType?.length || 0) +
        (filters.amenities?.length || 0) +
        (filters.preferredTenant ? 1 : 0)

    return (
        <Card className="border-2">
            <div className="p-4">
                {/* Filter Toggle Button */}
                <div className="flex items-center justify-between gap-4 mb-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by area or locality..."
                            value={filters.area || ""}
                            onChange={(e) => updateFilter("area", e.target.value)}
                            className="pl-10"
                        />
                    </div>
                    <Button
                        variant={showFilters ? "default" : "outline"}
                        onClick={() => setShowFilters(!showFilters)}
                        className="gap-2"
                    >
                        <SlidersHorizontal className="h-4 w-4" />
                        Filters
                        {activeFilterCount > 0 && (
                            <Badge variant="secondary" className="ml-1">
                                {activeFilterCount}
                            </Badge>
                        )}
                    </Button>
                </div>

                {/* Filter Panel */}
                {showFilters && (
                    <div className="space-y-6 pt-4 border-t">
                        {/* City Selection */}
                        {cities.length > 0 && (
                            <div className="space-y-2">
                                <Label>City</Label>
                                <Select
                                    value={filters.city || ""}
                                    onValueChange={(value) => updateFilter("city", value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select city" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {cities.map((city) => (
                                            <SelectItem key={city} value={city}>
                                                {city}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Price Range */}
                        <div className="space-y-3">
                            <Label>Price Range (₹/month)</Label>
                            <div className="flex gap-4 items-center">
                                <Input
                                    type="number"
                                    placeholder="Min"
                                    value={filters.minPrice || ""}
                                    onChange={(e) =>
                                        updateFilter("minPrice", parseInt(e.target.value) || 0)
                                    }
                                    className="w-28"
                                />
                                <span className="text-muted-foreground">to</span>
                                <Input
                                    type="number"
                                    placeholder="Max"
                                    value={filters.maxPrice || ""}
                                    onChange={(e) =>
                                        updateFilter("maxPrice", parseInt(e.target.value) || 100000)
                                    }
                                    className="w-28"
                                />
                            </div>
                        </div>

                        {/* Room Type */}
                        <div className="space-y-2">
                            <Label>Room Type</Label>
                            <div className="flex flex-wrap gap-2">
                                {ROOM_TYPES.map((type) => (
                                    <Badge
                                        key={type}
                                        variant={
                                            filters.roomType?.includes(type) ? "default" : "outline"
                                        }
                                        className="cursor-pointer"
                                        onClick={() => toggleArrayFilter("roomType", type)}
                                    >
                                        {type}
                                    </Badge>
                                ))}
                            </div>
                        </div>

                        {/* Amenities */}
                        {amenities.length > 0 && (
                            <div className="space-y-2">
                                <Label>Amenities</Label>
                                <div className="flex flex-wrap gap-2">
                                    {amenities.slice(0, 8).map((amenity) => (
                                        <Badge
                                            key={amenity}
                                            variant={
                                                filters.amenities?.includes(amenity)
                                                    ? "default"
                                                    : "outline"
                                            }
                                            className="cursor-pointer"
                                            onClick={() => toggleArrayFilter("amenities", amenity)}
                                        >
                                            {amenity}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Preferred Tenant */}
                        <div className="space-y-2">
                            <Label>Preferred For</Label>
                            <Select
                                value={filters.preferredTenant || ""}
                                onValueChange={(value) => updateFilter("preferredTenant", value)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Any" />
                                </SelectTrigger>
                                <SelectContent>
                                    {TENANT_PREFERENCES.map((pref) => (
                                        <SelectItem key={pref} value={pref}>
                                            {pref}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Clear Filters */}
                        {activeFilterCount > 0 && (
                            <Button
                                variant="outline"
                                onClick={clearFilters}
                                className="w-full gap-2"
                            >
                                <X className="h-4 w-4" />
                                Clear All Filters
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </Card>
    )
}
