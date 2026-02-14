"use client"

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { ArrowUpDown } from "lucide-react"

export type SortOption =
    | "newest"
    | "price-low"
    | "price-high"
    | "most-viewed"
    | "featured"

interface PropertySortControlsProps {
    totalResults: number
    onSortChange: (sortBy: SortOption) => void
    currentSort?: SortOption
}

export function PropertySortControls({
    totalResults,
    onSortChange,
    currentSort = "newest",
}: PropertySortControlsProps) {
    return (
        <div className="flex items-center justify-between gap-4 py-4">
            <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{totalResults}</span>{" "}
                {totalResults === 1 ? "property" : "properties"} found
            </p>

            <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                <Select value={currentSort} onValueChange={onSortChange}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="newest">Newest First</SelectItem>
                        <SelectItem value="price-low">Price: Low to High</SelectItem>
                        <SelectItem value="price-high">Price: High to Low</SelectItem>
                        <SelectItem value="most-viewed">Most Viewed</SelectItem>
                        <SelectItem value="featured">Featured First</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    )
}
