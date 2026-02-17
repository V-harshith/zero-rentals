"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Home, Plus, Edit, Eye, Loader2, BarChart3, Trash2 } from "lucide-react"
import Link from "next/link"
import type { Property } from "@/lib/types"
import { ROUTES } from "@/lib/constants"

import { toast } from "sonner"
import { useState } from "react"
import { deleteProperty } from "@/lib/data-service"
import { useAuth } from "@/lib/auth-context"

export interface PropertiesTabProps {
    properties: Property[]
    loading: boolean
    onRefresh: () => void
    hasAnalytics?: boolean
    isPremium?: boolean
}

export function PropertiesTab({ properties, loading, onRefresh, hasAnalytics = false, isPremium = false }: PropertiesTabProps) {
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const { user } = useAuth()

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this property? This action cannot be undone.")) {
            return
        }

        if (!user?.id) {
            toast.error("You must be logged in to delete properties")
            return
        }

        setDeletingId(id)
        try {
            const { error } = await deleteProperty(id, user.id)
            if (error) throw error
            toast.success("Property deleted successfully")
            onRefresh()
        } catch (error) {
            toast.error("Failed to delete property")
        } finally {
            setDeletingId(null)
        }
    }

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
                <CardContent className="py-8">
                    <div className="text-center">
                        <Home className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-muted-foreground mb-4">
                            You haven't listed any properties yet.
                        </p>
                        <Link href={ROUTES.POST_PROPERTY}>
                            <Button>Add Your First Property</Button>
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
                    <CardTitle>My Properties</CardTitle>
                    <Link href={ROUTES.POST_PROPERTY}>
                        <Button size="sm" className="gap-2">
                            <Plus className="h-4 w-4" />
                            Add New
                        </Button>
                    </Link>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {properties.map((property) => {
                        const price = property.price || 0
                        const location = `${property.location?.area || ""}, ${property.location?.city || ""}`.replace(/^, |, $/g, "")

                        return (
                            <div
                                key={property.id}
                                className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                            >
                                <div className="flex items-center gap-4 mb-4 md:mb-0">
                                    {/* Property Image */}
                                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                                        <img
                                            src={property.images?.[0] || "/placeholder.svg"}
                                            alt={property.title}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>

                                    {/* Property Info */}
                                    <div>
                                        <h3 className="font-semibold">{property.title}</h3>
                                        <p className="text-sm text-muted-foreground">{location}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <p className="text-sm font-medium text-accent">
                                                ₹{price.toLocaleString()}/month
                                            </p>
                                            {property.status === 'pending' && (
                                                <Badge variant="outline" className="text-yellow-600 bg-yellow-50 border-yellow-200">
                                                    Pending Review
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 md:gap-4">
                                    {/* View Count - Only for Premium (completely hidden for free) */}
                                    {hasAnalytics && (
                                        <div className="flex items-center gap-1 text-sm text-muted-foreground" title="Property views">
                                            <Eye className="h-4 w-4" />
                                            <span>{property.views || 0}</span>
                                        </div>
                                    )}

                                    {/* Status Badge */}
                                    <Badge
                                        variant={
                                            property.availability === "Available" ? "default" : "secondary"
                                        }
                                    >
                                        {property.availability}
                                    </Badge>

                                    {/* Analytics Button */}
                                    {isPremium ? (
                                        <Link href={ROUTES.PROPERTY_ANALYTICS(property.id)}>
                                            <Button variant="ghost" size="icon" title="View Analytics">
                                                <BarChart3 className="h-4 w-4" />
                                            </Button>
                                        </Link>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            title="Analytics - Upgrade to view"
                                            onClick={() => toast.info("Analytics is a premium feature", {
                                                description: "Upgrade to a paid plan to view detailed analytics for your properties.",
                                                action: {
                                                    label: "View Plans",
                                                    onClick: () => window.location.href = "/pricing"
                                                }
                                            })}
                                        >
                                            <BarChart3 className="h-4 w-4 text-muted-foreground" />
                                        </Button>
                                    )}

                                    {/* Edit Button */}
                                    <Link href={ROUTES.PROPERTY_EDIT(property.id)}>
                                        <Button variant="ghost" size="icon">
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                    </Link>

                                    {/* Delete Button */}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                        disabled={deletingId === property.id}
                                        onClick={() => handleDelete(property.id)}
                                    >
                                        {deletingId === property.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}
