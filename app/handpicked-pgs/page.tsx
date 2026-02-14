"use client"

import { useEffect, useState } from "react"
import { PropertyCard } from "@/components/property-card"
import { Loader2, Award } from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { Property } from "@/lib/types"
import { NoPropertiesFound } from "@/components/empty-state"

export default function HandpickedPGsPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchHandpickedPGs() {
      try {
        // Fetch verified properties or those with high views
        const { data, error } = await supabase
          .from("properties")
          .select("*")
          .eq("status", "active")
          .eq("verified", true)
          .order("views", { ascending: false })
          .limit(12)

        if (error) throw error
        setProperties(data || [])
      } catch (error) {
        console.error("Error fetching handpicked PGs:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchHandpickedPGs()
  }, [])

  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Award className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">Handpicked Properties</h1>
          </div>
          <p className="text-muted-foreground">
            Our experts have personally verified these top-rated accommodations
          </p>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="mt-4 text-muted-foreground">Loading handpicked properties...</p>
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
