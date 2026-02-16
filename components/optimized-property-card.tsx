"use client"

import { useState } from "react"
import Image from "next/image"
import { motion } from "framer-motion"
import Link from "next/link"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MapPin, Bed, Users, Star, Heart, Eye, Loader2 } from "lucide-react"
import type { Property } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useFavorites } from "@/lib/favorites-context"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface OptimizedPropertyCardProps {
    property: Property
    index?: number
    priority?: boolean // For LCP optimization on first images
}

export function OptimizedPropertyCard({ property, index = 0, priority = false }: OptimizedPropertyCardProps) {
    const { user } = useAuth()
    const { isFavorite, addFavorite, removeFavorite, isLoading: isFavoritesLoading } = useFavorites()
    const router = useRouter()
    const [imageLoaded, setImageLoaded] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)

    const mainImage = property.images[0] || "/placeholder-property.jpg"
    const isPropertyFavorite = isFavorite(property.id)

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1, duration: 0.4 }}
            whileHover={{ y: -8 }}
            className="h-full"
        >
            <Card className="overflow-hidden h-full flex flex-col hover:shadow-2xl transition-all duration-300 group">
                {/* Image Container */}
                <div className="relative h-48 w-full overflow-hidden bg-gray-200">
                    {/* Blur Placeholder */}
                    {!imageLoaded && (
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 animate-pulse" />
                    )}

                    {/* Optimized Image */}
                    <Image
                        src={mainImage}
                        alt={property.title}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        className={cn(
                            "object-cover transition-all duration-500 group-hover:scale-110",
                            imageLoaded ? "opacity-100" : "opacity-0"
                        )}
                        onLoad={() => setImageLoaded(true)}
                        loading={priority ? "eager" : "lazy"}
                        priority={priority}
                        quality={75}
                    />

                    {/* Badges Overlay */}
                    <div className="absolute top-3 left-3 flex gap-2">
                        {property.featured && (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.2 }}
                            >
                                <Badge className="bg-yellow-500 text-white border-0">
                                    <Star className="h-3 w-3 mr-1 fill-white" />
                                    Featured
                                </Badge>
                            </motion.div>
                        )}
                        <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm">
                            {property.propertyType}
                        </Badge>
                    </div>


                    {/* Favorite Button - Tenants Only */}
                    {user?.role === 'tenant' && (
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={async (e) => {
                                e.preventDefault()

                                // Check if user is logged in
                                if (!user) {
                                    toast.error("Please login to save favorites")
                                    router.push("/login/tenant")
                                    return
                                }

                                if (isProcessing || isFavoritesLoading) return

                                setIsProcessing(true)

                                // Use favorites context
                                if (isPropertyFavorite) {
                                    await removeFavorite(property.id)
                                } else {
                                    await addFavorite(property.id)
                                }

                                setIsProcessing(false)
                            }}
                            disabled={isProcessing || isFavoritesLoading}
                            className="absolute top-3 right-3 p-2 rounded-full bg-white/90 backdrop-blur-sm hover:bg-white transition-colors disabled:opacity-70"
                        >
                            {isProcessing ? (
                                <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
                            ) : (
                                <Heart
                                    className={cn(
                                        "h-5 w-5 transition-colors",
                                        isPropertyFavorite ? "fill-red-500 text-red-500" : "text-gray-600"
                                    )}
                                />
                            )}
                        </motion.button>
                    )}


                    {/* Views Counter - Tenants Only */}
                    {user?.role === 'tenant' && (
                        <div className="absolute bottom-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 backdrop-blur-sm text-white text-xs">
                            <Eye className="h-3 w-3" />
                            <span>{property.views || 0}</span>
                        </div>
                    )}
                </div>

                {/* Content */}
                <CardContent className="p-4 flex-1 flex flex-col">
                    <Link href={`/property/${property.id}`} className="flex-1">
                        <motion.h3
                            className="font-semibold text-lg mb-2 line-clamp-2 group-hover:text-primary transition-colors"
                            whileHover={{ x: 2 }}
                        >
                            {property.title}
                        </motion.h3>

                        <div className="flex items-start gap-1 text-sm text-muted-foreground mb-3">
                            <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span className="line-clamp-1">
                                {property.location?.area || "Unknown Area"}, {property.location?.city || "Unknown City"}
                            </span>
                        </div>

                        {/* Amenities */}
                        <div className="flex flex-wrap gap-2 mb-3">
                            <div className="flex items-center gap-1 text-xs text-gray-600">
                                <Bed className="h-3 w-3" />
                                <span>{property.roomType}</span>
                            </div>
                            {property.preferredTenant && (
                                <div className="flex items-center gap-1 text-xs text-gray-600">
                                    <Users className="h-3 w-3" />
                                    <span>{property.preferredTenant}</span>
                                </div>
                            )}
                        </div>

                        {/* Quick Amenities */}
                        <div className="flex flex-wrap gap-1 mb-3">
                            {property.amenities.slice(0, 3).map((amenity) => (
                                <Badge key={amenity} variant="outline" className="text-xs">
                                    {amenity}
                                </Badge>
                            ))}
                            {property.amenities.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                    +{property.amenities.length - 3}
                                </Badge>
                            )}
                        </div>
                    </Link>
                </CardContent>

                {/* Footer */}
                <CardFooter className="p-4 pt-0 flex items-center justify-between border-t">
                    <div>
                        <div className="text-2xl font-bold text-primary">
                            ₹{property.price.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">per month</div>
                    </div>
                    <Link href={`/property/${property.id}`}>
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                            <Button size="sm" className="shadow-md">
                                View Details
                            </Button>
                        </motion.div>
                    </Link>
                </CardFooter>
            </Card>
        </motion.div>
    )
}
