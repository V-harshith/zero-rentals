"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, XCircle, Loader2, MapPin, Eye } from "lucide-react"
import { toast } from "sonner"
import type { Property } from "@/lib/types"
import { approveProperty, rejectProperty } from "@/lib/data-service"

interface PendingPropertiesTabProps {
    properties: Property[]
    loading: boolean
    onRefresh: () => void
    searchQuery?: string
    onOptimisticRemove?: (propertyId: string) => void
}

export function PendingPropertiesTab({
    properties,
    loading,
    onRefresh,
    searchQuery = "",
    onOptimisticRemove
}: PendingPropertiesTabProps) {
    const filteredProperties = properties.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.location.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.owner.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    const [actionLoading, setActionLoading] = useState<{ id: string, type: 'approve' | 'reject' } | null>(null)

    const handleApprove = async (propertyId: string) => {
        setActionLoading({ id: propertyId, type: 'approve' })

        try {
            // Optimistic UI update - remove immediately
            if (onOptimisticRemove) {
                onOptimisticRemove(propertyId)
            }

            const { error } = await approveProperty(propertyId)

            if (error) {
                // Refresh to restore the property if approval failed
                onRefresh()
                throw new Error(error)
            }
            toast.success('Property approved and published')
            // Refresh in background to ensure consistency
            onRefresh()
        } catch {
            toast.error('Failed to approve property')
        } finally {
            setActionLoading(null)
        }
    }

    const handleReject = async (propertyId: string) => {
        setActionLoading({ id: propertyId, type: 'reject' })

        try {
            // Optimistic UI update - remove immediately
            if (onOptimisticRemove) {
                onOptimisticRemove(propertyId)
            }

            const { error } = await rejectProperty(propertyId)

            if (error) {
                // Refresh to restore the property if rejection failed
                onRefresh()
                throw new Error(error)
            }
            toast.success('Property rejected')
            // Refresh in background to ensure consistency
            onRefresh()
        } catch {
            toast.error('Failed to reject property')
        } finally {
            setActionLoading(null)
        }
    }

    if (loading) {
        return (
            <Card>
                <CardContent className="py-8">
                    <div className="text-center">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                        <p className="mt-4 text-muted-foreground">Loading pending properties...</p>
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
                        <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                        <p className="text-muted-foreground">No pending properties to review</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Pending Properties ({filteredProperties.length})</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {filteredProperties.map((property) => {
                        const location = `${property.location?.area || ""}, ${property.location?.city || ""}`.replace(/^, |, $/g, "")
                        const isActionInProgress = actionLoading?.id === property.id
                        const isApproveLoading = isActionInProgress && actionLoading?.type === 'approve'
                        const isRejectLoading = isActionInProgress && actionLoading?.type === 'reject'

                        return (
                            <div
                                key={property.id}
                                className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg"
                            >
                                <div className="flex items-center gap-4 mb-4 md:mb-0">
                                    {/* Property Image */}
                                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                                        <img
                                            src={property.images?.[0] || "/placeholder.svg"}
                                            alt={property.title}
                                            className="w-full h-full object-cover"
                                            loading="eager"
                                        />
                                    </div>

                                    {/* Property Info */}
                                    <div>
                                        <h3 className="font-semibold">{property.title}</h3>
                                        <div className="flex items-center text-sm text-muted-foreground">
                                            <MapPin className="h-3 w-3 mr-1" />
                                            {location}
                                        </div>
                                        <p className="text-sm font-bold text-primary">
                                            ₹{property.price?.toLocaleString()}/month
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Owner: {property.owner?.name || "Unknown"}
                                        </p>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="default"
                                        className="gap-2"
                                        onClick={() => handleApprove(property.id)}
                                        disabled={isActionInProgress}
                                    >
                                        {isApproveLoading ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <CheckCircle className="h-4 w-4" />
                                        )}
                                        Approve
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="gap-2"
                                        asChild
                                    >
                                        <a href={`/property/${property.id}`} target="_blank" rel="noopener noreferrer">
                                            <Eye className="h-4 w-4" />
                                            View
                                        </a>
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        className="gap-2"
                                        onClick={() => handleReject(property.id)}
                                        disabled={isActionInProgress}
                                    >
                                        {isRejectLoading ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <XCircle className="h-4 w-4" />
                                        )}
                                        Reject
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


