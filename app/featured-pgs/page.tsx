"use client"

import { useEffect, useState } from "react"
import { PropertyCard } from "@/components/property-card"
import { Loader2, Star } from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { Property } from "@/lib/types"
import { NoPropertiesFound } from "@/components/empty-state"

export default function FeaturedPGsPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchFeaturedPGs() {
      try {
        const { data, error } = await supabase
          .from("properties")
          .select("*")
          .eq("status", "active")
          .eq("featured", true)
          .order("created_at", { ascending: false })
          .limit(12)

        if (error) throw error
        setProperties(data || [])
      } catch (error) {
        console.error("Error fetching featured PGs:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchFeaturedPGs()
  }, [])

  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Star className="h-6 w-6 text-yellow-500 fill-yellow-500" />
            <h1 className="text-3xl font-bold">Featured Properties</h1>
          </div>
          <p className="text-muted-foreground">
            Premium properties handpicked for quality and comfort
          </p>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="mt-4 text-muted-foreground">Loading featured properties...</p>
          </div>
        ) : properties.length === 0 ? (
          <NoPropertiesFound />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {properties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
