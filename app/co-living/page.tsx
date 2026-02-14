"use client"

import { useEffect, useState } from "react"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { PropertyCard } from "@/components/property-card"
import { PropertyFilterBar, FilterOptions } from "@/components/property-filter-bar"
import { PropertySortControls, SortOption } from "@/components/property-sort-controls"
import { PropertyListSkeleton } from "@/components/loading-skeleton"
import { Users } from "lucide-react"
import { searchProperties } from "@/lib/data-service"
import type { Property } from "@/lib/types"
import { NoPropertiesFound } from "@/components/empty-state"
import { toast } from "sonner"

export default function CoLivingPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [filteredProperties, setFilteredProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortOption>("newest")
  const [filters, setFilters] = useState<FilterOptions>({})

  useEffect(() => {
    async function fetchCoLivingSpaces() {
      try {
        const data = await searchProperties({ propertyType: "Co-living" })
        setProperties(data)
        setFilteredProperties(data)
      } catch (error) {
        console.error("Error fetching co-living spaces:", error)
        toast.error("Failed to load properties. Please try again.")
      } finally {
        setLoading(false)
      }
    }
    fetchCoLivingSpaces()
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
    "Laundry",
    "Gym",
    "Common Kitchen",
    "Workspace",
    "Netflix",
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-gradient-to-r from-purple-600 via-pink-600 to-purple-700 text-white py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-white/20 backdrop-blur-sm rounded-lg">
                  <Users className="h-8 w-8" />
                </div>
                <h1 className="text-4xl md:text-5xl font-bold">
                  Co-Living Spaces
                </h1>
              </div>
              <p className="text-lg md:text-xl text-white/90 mb-6">
                Discover modern co-living communities designed for young
                professionals. Shared amenities, community events, and
                flexibility you need.
              </p>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
                  <span className="font-semibold">{properties.length}+</span>
                  <span>Spaces</span>
                </div>
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
                  <span className="font-semibold">{uniqueCities.length}+</span>
                  <span>Cities</span>
                </div>
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
                  <span>Community Living</span>
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
