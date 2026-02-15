"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { PropertyCard } from "@/components/property-card"
import { PropertyFilterBar, FilterOptions } from "@/components/property-filter-bar"
import { PropertySortControls, SortOption } from "@/components/property-sort-controls"
import { PropertyListSkeleton } from "@/components/loading-skeleton"
import { Building2 } from "lucide-react"
import { searchProperties } from "@/lib/data-service"
import type { Property } from "@/lib/types"
import { NoPropertiesFound } from "@/components/empty-state"
import { toast } from "sonner"

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

export default function RentPage() {
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
    const newUrl = `/rent${params.toString() ? `?${params.toString()}` : ""}`

    if (window.location.pathname + window.location.search !== newUrl) {
      router.replace(newUrl, { scroll: false })
    }
  }, [filters, router])

  useEffect(() => {
    async function fetchRentals() {
      try {
        const data = await searchProperties({ propertyType: "Rent" })
        setProperties(data)
        setFilteredProperties(data)
      } catch (error) {
        console.error("Error fetching rental properties:", error)
        toast.error("Failed to load properties. Please try again.")
      } finally {
        setLoading(false)
      }
    }
    fetchRentals()
  }, [])

  // Apply filters
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

    if (filters.preferredTenant && filters.preferredTenant !== "Any") {
      filtered = filtered.filter(
        (p) =>
          p.preferredTenant === filters.preferredTenant ||
          p.preferredTenant === "Any"
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

  const uniqueCities = Array.from(
    new Set(properties.map((p) => p.location.city))
  )

  const commonAmenities = [
    "WiFi",
    "AC",
    "Parking",
    "Lift",
    "Security",
    "Power Backup",
    "Swimming Pool",
    "Garden",
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-gradient-to-r from-green-600 via-teal-600 to-green-700 text-white py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-white/20 backdrop-blur-sm rounded-lg">
                  <Building2 className="h-8 w-8" />
                </div>
                <h1 className="text-4xl md:text-5xl font-bold">
                  Rental Properties
                </h1>
              </div>
              <p className="text-lg md:text-xl text-white/90 mb-6">
                Find your perfect rental home. Browse verified apartments,
                villas, and houses across major Indian cities. Quality living
                spaces for families and professionals.
              </p>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
                  <span className="font-semibold">{properties.length}+</span>
                  <span>Properties</span>
                </div>
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
                  <span className="font-semibold">{uniqueCities.length}+</span>
                  <span>Cities</span>
                </div>
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
                  <span>Verified Listings</span>
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
              <PropertyListSkeleton count={6} />
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
