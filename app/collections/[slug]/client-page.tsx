"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { PropertyCard } from "@/components/property-card"
import { PropertyFilterBar, FilterOptions } from "@/components/property-filter-bar"
import { PropertySortControls, SortOption } from "@/components/property-sort-controls"
import { Loader2, Sparkles, ArrowLeft } from "lucide-react"
import { searchProperties } from "@/lib/data-service"
import type { Property } from "@/lib/types"
import { NoPropertiesFound } from "@/components/empty-state"
import { toast } from "sonner"
import Link from "next/link"
import { Button } from "@/components/ui/button"

// Parse URL parameters to filter state
function parseUrlParams(params: URLSearchParams): FilterOptions {
  const minPrice = params.get("minPrice")
  const maxPrice = params.get("maxPrice")

  return {
    city: params.get("city") || undefined,
    area: params.get("area") || undefined,
    minPrice: minPrice && !isNaN(parseInt(minPrice)) ? parseInt(minPrice) : undefined,
    maxPrice: maxPrice && !isNaN(parseInt(maxPrice)) ? parseInt(maxPrice) : undefined,
    roomType: params.get("roomType")?.split(",").filter(Boolean) || undefined,
    amenities: params.get("amenities")?.split(",").filter(Boolean) || undefined,
    preferredTenant: params.get("preferredTenant") || undefined,
  }
}

// Build URL params from filter state
function buildUrlParams(filters: FilterOptions): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.city) params.set("city", filters.city)
  if (filters.area) params.set("area", filters.area)
  if (filters.minPrice !== undefined && filters.minPrice > 0) params.set("minPrice", filters.minPrice.toString())
  if (filters.maxPrice !== undefined && filters.maxPrice < 100000) params.set("maxPrice", filters.maxPrice.toString())
  if (filters.roomType?.length) params.set("roomType", filters.roomType.join(","))
  if (filters.amenities?.length) params.set("amenities", filters.amenities.join(","))
  if (filters.preferredTenant && filters.preferredTenant !== "Any") params.set("preferredTenant", filters.preferredTenant)
  return params
}

const COLLECTION_CONFIG: Record<string, {
    title: string
    description: string
    filter: (property: Property) => boolean
    color: string
}> = {
    "budget-friendly": {
        title: "Budget Friendly PGs",
        description: "Affordable accommodations without compromising on quality",
        filter: (p) => p.price <= 10000,
        color: "from-emerald-600 to-green-600",
    },
    "wifi-included": {
        title: "WiFi Included",
        description: "Properties with high-speed internet connectivity",
        filter: (p) => p.amenities.some((a) => a.toLowerCase().includes("wifi")),
        color: "from-blue-600 to-cyan-600",
    },
    "meals-included": {
        title: "Meals Included",
        description: "Homely food included in your rent",
        filter: (p) => p.amenities.some((a) => a.toLowerCase().includes("meal") || a.toLowerCase().includes("food")),
        color: "from-orange-600 to-amber-600",
    },
    "for-students": {
        title: "For Students",
        description: "Student-friendly accommodations near colleges",
        filter: (p) => p.price <= 12000,
        color: "from-indigo-600 to-purple-600",
    },
    "single-rooms": {
        title: "Single Rooms",
        description: "Private single occupancy rooms for maximum privacy",
        filter: (p) => p.roomType === "Single",
        color: "from-pink-600 to-rose-600",
    },
    "for-professionals": {
        title: "For Professionals",
        description: "Professional working environment with modern amenities",
        filter: (p) => p.price >= 12000 && p.propertyType !== "Rent",
        color: "from-slate-700 to-gray-800",
    },
}

export default function CollectionClientPage({ slug }: { slug: string }) {
    const config = COLLECTION_CONFIG[slug]
    const router = useRouter()
    const searchParams = useSearchParams()

    const [properties, setProperties] = useState<Property[]>([])
    const [filteredProperties, setFilteredProperties] = useState<Property[]>([])
    const [loading, setLoading] = useState(true)
    const [sortBy, setSortBy] = useState<SortOption>("newest")
    const [filters, setFilters] = useState<FilterOptions>(() => parseUrlParams(searchParams))
    const prevFiltersRef = useRef<FilterOptions>(filters)

    // Re-initialize filters when URL changes (back/forward navigation)
    useEffect(() => {
        setFilters(parseUrlParams(searchParams))
    }, [searchParams])

    // Sync URL with filters
    useEffect(() => {
        const prev = prevFiltersRef.current
        const filtersChanged = JSON.stringify(prev) !== JSON.stringify(filters)

        if (!filtersChanged) return

        prevFiltersRef.current = filters

        const params = buildUrlParams(filters)
        const newUrl = `/collections/${slug}${params.toString() ? `?${params.toString()}` : ""}`

        if (window.location.pathname + window.location.search !== newUrl) {
            router.replace(newUrl, { scroll: false })
        }
    }, [filters, router, slug])

    useEffect(() => {
        async function fetchCollectionProperties() {
            if (!config) {
                setLoading(false)
                return
            }

            try {
                const data = await searchProperties({})
                const collectionFiltered = data.filter(config.filter)
                setProperties(collectionFiltered)
                setFilteredProperties(collectionFiltered)
            } catch (error) {
                console.error("Error fetching collection properties:", error)
                toast.error("Failed to load properties. Please try again.")
            } finally {
                setLoading(false)
            }
        }
        fetchCollectionProperties()
    }, [slug])

    // Apply additional filters
    useEffect(() => {
        let filtered = [...properties]

        if (filters.city) {
            filtered = filtered.filter(
                (p) => p.location.city.toLowerCase() === filters.city?.toLowerCase()
            )
        }

        if (filters.area) {
            filtered = filtered.filter((p) =>
                p.location.area.toLowerCase().includes(filters.area?.toLowerCase() || "")
            )
        }

        if (filters.minPrice !== undefined) {
            filtered = filtered.filter((p) => p.price >= (filters.minPrice || 0))
        }
        if (filters.maxPrice !== undefined) {
            filtered = filtered.filter((p) => p.price <= (filters.maxPrice || 100000))
        }

        if (filters.roomType && filters.roomType.length > 0) {
            filtered = filtered.filter((p) => filters.roomType?.includes(p.roomType))
        }

        if (filters.amenities && filters.amenities.length > 0) {
            filtered = filtered.filter((p) =>
                filters.amenities?.every((amenity) => p.amenities.includes(amenity))
            )
        }

        setFilteredProperties(filtered)
    }, [filters, properties])

    // Apply sorting
    useEffect(() => {
        const sorted = [...filteredProperties].sort((a, b) => {
            switch (sortBy) {
                case "price-low":
                    return a.price - b.price
                case "price-high":
                    return b.price - a.price
                case "most-viewed":
                    return (b.views || 0) - (a.views || 0)
                case "featured":
                    return (b.featured ? 1 : 0) - (a.featured ? 1 : 0)
                case "newest":
                default:
                    return (
                        new Date(b.createdAt || "").getTime() -
                        new Date(a.createdAt || "").getTime()
                    )
            }
        })
        setFilteredProperties(sorted)
    }, [sortBy])

    if (!config) {
        return (
            <div className="min-h-screen flex flex-col">
                <Header />
                <main className="flex-1 flex items-center justify-center">
                    <div className="text-center py-16 px-4">
                        <h1 className="text-3xl font-bold mb-4">Collection Not Found</h1>
                        <p className="text-muted-foreground mb-6">
                            The collection you're looking for doesn't exist.
                        </p>
                        <Link href="/">
                            <Button>
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Back to Home
                            </Button>
                        </Link>
                    </div>
                </main>
                <Footer />
            </div>
        )
    }

    const uniqueCities = Array.from(
        new Set(properties.map((p) => p.location.city))
    )

    const commonAmenities = [
        "WiFi",
        "AC",
        "Parking",
        "Laundry",
        "Meals",
        "Gym",
        "Security",
        "Power Backup",
    ]

    return (
        <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-1">
                {/* Hero Section */}
                <section className={`bg-gradient-to-r ${config.color} text-white py-16 md:py-20`}>
                    <div className="container mx-auto px-4">
                        <div className="max-w-3xl">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-white/20 backdrop-blur-sm rounded-lg">
                                    <Sparkles className="h-8 w-8" />
                                </div>
                                <h1 className="text-4xl md:text-5xl font-bold">{config.title}</h1>
                            </div>
                            <p className="text-lg md:text-xl text-white/90 mb-6">
                                {config.description}
                            </p>
                            <div className="flex flex-wrap gap-4 text-sm">
                                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
                                    <span className="font-semibold">{properties.length}</span>
                                    <span>Properties</span>
                                </div>
                                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
                                    <span className="font-semibold">{uniqueCities.length}</span>
                                    <span>Cities</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Main Content */}
                <section className="py-8 md:py-12 bg-muted/30">
                    <div className="container mx-auto px-4">
                        <div className="mb-6">
                            <PropertyFilterBar
                                onFilterChange={setFilters}
                                cities={uniqueCities}
                                amenities={commonAmenities}
                            />
                        </div>

                        {loading ? (
                            <div className="text-center py-16">
                                <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary mb-4" />
                                <p className="text-lg text-muted-foreground">
                                    Loading properties...
                                </p>
                            </div>
                        ) : (
                            <>
                                <PropertySortControls
                                    totalResults={filteredProperties.length}
                                    onSortChange={setSortBy}
                                    currentSort={sortBy}
                                />

                                {filteredProperties.length === 0 ? (
                                    <NoPropertiesFound />
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {filteredProperties.map((property) => (
                                            <PropertyCard key={property.id} property={property} />
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    )
}
