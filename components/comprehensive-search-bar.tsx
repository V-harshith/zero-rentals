"use client"

import { SearchBar } from "@/components/search/SearchBar"

interface ComprehensiveSearchBarProps {
    className?: string
}

export function ComprehensiveSearchBar({ className }: ComprehensiveSearchBarProps) {
    return <SearchBar className={className} />
}
