"use client"

import { motion } from "framer-motion"
import { OptimizedPropertyCard } from "@/components/optimized-property-card"
import { PropertyGridSkeleton } from "@/components/property-card-skeleton"
import { Star } from "lucide-react"
import type { Property } from "@/lib/types"

interface FeaturedPropertiesProps {
  initialProperties?: Property[]
}

export function FeaturedProperties({ initialProperties = [] }: FeaturedPropertiesProps) {
  // If no properties provided, don't render (or we could render a skeletal state/fallback)
  if (!initialProperties || initialProperties.length === 0) {
    return null
  }

  return (
    <section className="py-12 md:py-16 bg-gradient-to-b from-white to-muted/30">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <Star className="h-6 w-6 text-yellow-600 fill-yellow-600" />
            </div>
            <div>
              <h2 className="text-3xl font-bold">Featured Properties</h2>
              <p className="text-muted-foreground">
                Premium properties handpicked for quality and comfort
              </p>
            </div>
          </div>
        </motion.div>

        {/* Properties Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {initialProperties.map((property, index) => (
            <OptimizedPropertyCard
              key={property.id}
              property={property}
              index={index}
              priority={index < 3} // Prioritize first 3 images for LCP
            />
          ))}
        </div>
      </div>
    </section>
  )
}
