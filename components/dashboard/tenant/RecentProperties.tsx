"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MapPin, Eye, Loader2, Search } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import type { Property } from "@/lib/types"

interface RecentPropertiesProps {
    properties: Property[]
    loading: boolean
}

export function RecentProperties({ properties, loading }: RecentPropertiesProps) {
    if (loading) {
        return (
            <Card>
                <CardContent className="py-8">
                    <div className="text-center">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                        <p className="mt-4 text-muted-foreground">Loading properties...</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (properties.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Recent Properties</CardTitle>
                </CardHeader>
                <CardContent className="py-8">
                    <div className="text-center">
                        <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-muted-foreground mb-4">
                            No properties available yet
                        </p>
                        <Link href="/search">
                            <Button>Start Searching</Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>Recent Properties</CardTitle>
                    <Link href="/search">
                        <Button variant="outline" size="sm">View All</Button>
                    </Link>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {properties.map((property) => {
                        const location = `${property.location?.area || ""}, ${property.location?.city || ""}`.replace(/^, |, $/g, "")

                        return (
                            <Link
                                key={property.id}
                                href={`/property/${property.id}`}
                                className="block"
                            >
                                <div className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                                    {/* Property Image */}
                                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative">
                                        <Image
                                            src={property.images?.[0] || "/placeholder.svg"}
                                            alt={property.title}
                                            fill
                                            className="object-cover"
                                            sizes="80px"
                                        />
                                    </div>

                                    {/* Property Info */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold truncate">{property.title}</h3>
                                        <div className="flex items-center text-sm text-muted-foreground">
                                            <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                                            <span className="truncate">{location}</span>
                                        </div>
                                        <div className="flex items-center justify-between mt-1">
                                            <p className="text-sm font-medium text-accent">
                                                ₹{property.price?.toLocaleString()}/month
                                            </p>
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <Eye className="h-3 w-3" />
                                                <span>{property.views || 0}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}
