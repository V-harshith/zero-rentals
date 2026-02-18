"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useCsrf } from "@/lib/csrf-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, XCircle, Loader2, MapPin, Eye } from "lucide-react"
import { toast } from "sonner"
import type { Property } from "@/lib/types"
import { approveProperty, rejectProperty } from "@/lib/data-service"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

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
    const { csrfToken, isLoading: isCsrfLoading } = useCsrf()

    // Multi-select state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [bulkActionLoading, setBulkActionLoading] = useState(false)
    const [showBulkRejectDialog, setShowBulkRejectDialog] = useState(false)

    // Clear selection when properties data changes to prevent stale selections
    useEffect(() => {
        setSelectedIds(new Set())
    }, [properties])

    const handleApprove = async (propertyId: string) => {
        // Check for CSRF token before making request
        if (!csrfToken) {
            toast.error('Security token not available. Please wait a moment and try again.')
            return
        }

        setActionLoading({ id: propertyId, type: 'approve' })

        try {
            // Optimistic UI update - remove immediately
            if (onOptimisticRemove) {
                onOptimisticRemove(propertyId)
            }

            const { error } = await approveProperty(propertyId, csrfToken)

            if (error) {
                // Refresh to restore the property if approval failed
                onRefresh()
                throw new Error(error)
            }
            toast.success('Property approved and published')
        } catch (err: any) {
            toast.error(err?.message || 'Failed to approve property')
        } finally {
            setActionLoading(null)
        }
    }

    const handleReject = async (propertyId: string) => {
        // Check for CSRF token before making request
        if (!csrfToken) {
            toast.error('Security token not available. Please wait a moment and try again.')
            return
        }

        setActionLoading({ id: propertyId, type: 'reject' })

        try {
            // Optimistic UI update - remove immediately
            if (onOptimisticRemove) {
                onOptimisticRemove(propertyId)
            }

            const { error } = await rejectProperty(propertyId, undefined, csrfToken)

            if (error) {
                // Refresh to restore the property if rejection failed
                onRefresh()
                throw new Error(error)
            }
            toast.success('Property rejected')
        } catch (err: any) {
            toast.error(err?.message || 'Failed to reject property')
        } finally {
            setActionLoading(null)
        }
    }

    // Multi-select helpers
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredProperties.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(filteredProperties.map(p => p.id)))
        }
    }

    const bulkApprove = async () => {
        if (selectedIds.size === 0) return

        // Check for CSRF token before making request
        if (!csrfToken) {
            toast.error('Security token not available. Please wait a moment and try again.')
            return
        }

        const count = selectedIds.size
        const confirmed = window.confirm(
            `Are you sure you want to approve ${count} propert${count === 1 ? 'y' : 'ies'}?`
        )
        if (!confirmed) return

        setBulkActionLoading(true)
        const ids = Array.from(selectedIds)
        let successCount = 0
        let errorCount = 0

        try {
            // Process sequentially to avoid overwhelming the server
            for (const id of ids) {
                try {
                    if (onOptimisticRemove) {
                        onOptimisticRemove(id)
                    }

                    const { error } = await approveProperty(id, csrfToken)
                    if (error) {
                        errorCount++
                    } else {
                        successCount++
                    }
                } catch {
                    errorCount++
                }
            }

            if (successCount > 0) {
                toast.success(`${successCount} propert${successCount === 1 ? 'y' : 'ies'} approved successfully`)
            }
            if (errorCount > 0) {
                toast.error(`Failed to approve ${errorCount} propert${errorCount === 1 ? 'y' : 'ies'}`)
            }
        } finally {
            setSelectedIds(new Set())
            setBulkActionLoading(false)
            // Refresh to ensure consistency
            onRefresh()
        }
    }

    const bulkReject = async () => {
        if (selectedIds.size === 0) return

        // Check for CSRF token before making request
        if (!csrfToken) {
            toast.error('Security token not available. Please wait a moment and try again.')
            return
        }

        const count = selectedIds.size
        setBulkActionLoading(true)
        const ids = Array.from(selectedIds)
        let successCount = 0
        let errorCount = 0

        try {
            // Process sequentially to avoid overwhelming the server
            for (const id of ids) {
                try {
                    if (onOptimisticRemove) {
                        onOptimisticRemove(id)
                    }

                    const { error } = await rejectProperty(id, 'Bulk admin action', csrfToken)
                    if (error) {
                        errorCount++
                    } else {
                        successCount++
                    }
                } catch {
                    errorCount++
                }
            }

            if (successCount > 0) {
                toast.success(`${successCount} propert${successCount === 1 ? 'y' : 'ies'} rejected successfully`)
            }
            if (errorCount > 0) {
                toast.error(`Failed to reject ${errorCount} propert${errorCount === 1 ? 'y' : 'ies'}`)
            }
        } finally {
            setSelectedIds(new Set())
            setBulkActionLoading(false)
            setShowBulkRejectDialog(false)
            // Refresh to ensure consistency
            onRefresh()
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
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Pending Properties ({filteredProperties.length})</CardTitle>
                        {selectedIds.size > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">
                                    {selectedIds.size} selected
                                </span>
                            </div>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Bulk Actions Bar */}
                    {selectedIds.size > 0 && (
                        <div className="flex items-center justify-between bg-muted/50 border rounded-lg px-4 py-3 mb-4">
                            <span className="text-sm font-medium">
                                {selectedIds.size} propert{selectedIds.size === 1 ? 'y' : 'ies'} selected
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="default"
                                    onClick={bulkApprove}
                                    disabled={bulkActionLoading || isCsrfLoading}
                                    className="gap-2"
                                >
                                    {bulkActionLoading ? (
                                        <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                                    ) : (
                                        <><CheckCircle className="h-4 w-4" /> Approve ({selectedIds.size})</>
                                    )}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => setShowBulkRejectDialog(true)}
                                    disabled={bulkActionLoading || isCsrfLoading}
                                    className="gap-2"
                                >
                                    <XCircle className="h-4 w-4" />
                                    Reject ({selectedIds.size})
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setSelectedIds(new Set())}
                                    disabled={bulkActionLoading}
                                >
                                    Clear
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        {/* Select All Header */}
                        {filteredProperties.length > 0 && (
                            <div className="flex items-center gap-3 pb-2 border-b">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                                    checked={filteredProperties.length > 0 && selectedIds.size === filteredProperties.length}
                                    onChange={toggleSelectAll}
                                />
                                <span className="text-sm text-muted-foreground">
                                    {selectedIds.size === filteredProperties.length ? 'Deselect all' : 'Select all'}
                                </span>
                            </div>
                        )}

                        {filteredProperties.map((property) => {
                            const location = `${property.location?.area || ""}, ${property.location?.city || ""}`.replace(/^, |, $/g, "")
                            const isActionInProgress = actionLoading?.id === property.id
                            const isApproveLoading = isActionInProgress && actionLoading?.type === 'approve'
                            const isRejectLoading = isActionInProgress && actionLoading?.type === 'reject'
                            const isSelected = selectedIds.has(property.id)

                            return (
                                <div
                                    key={property.id}
                                    className={`flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg transition-colors ${isSelected ? 'bg-muted/50 border-primary/20' : ''}`}
                                >
                                    <div className="flex items-center gap-4 mb-4 md:mb-0">
                                        {/* Checkbox */}
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-gray-300 cursor-pointer flex-shrink-0"
                                            checked={isSelected}
                                            onChange={() => toggleSelect(property.id)}
                                        />

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
                                    <div className="flex flex-wrap items-center gap-2 mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0">
                                        <Button
                                            size="sm"
                                            variant="default"
                                            className="gap-2 flex-1 md:flex-none justify-center"
                                            onClick={() => handleApprove(property.id)}
                                            disabled={isActionInProgress || isCsrfLoading}
                                        >
                                            {isApproveLoading ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <CheckCircle className="h-4 w-4" />
                                            )}
                                            <span className="hidden sm:inline">Approve</span>
                                            <span className="sm:hidden">OK</span>
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-2 flex-1 md:flex-none justify-center"
                                            asChild
                                        >
                                            <a href={`/property/${property.id}`} target="_blank" rel="noopener noreferrer">
                                                <Eye className="h-4 w-4" />
                                                <span className="hidden sm:inline">View</span>
                                            </a>
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            className="gap-2 flex-1 md:flex-none justify-center"
                                            onClick={() => handleReject(property.id)}
                                            disabled={isActionInProgress || isCsrfLoading}
                                        >
                                            {isRejectLoading ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <XCircle className="h-4 w-4" />
                                            )}
                                            <span className="hidden sm:inline">Reject</span>
                                            <span className="sm:hidden">No</span>
                                        </Button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Bulk Reject Confirmation Dialog */}
            <AlertDialog open={showBulkRejectDialog} onOpenChange={setShowBulkRejectDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reject Multiple Properties</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to reject {selectedIds.size} propert{selectedIds.size === 1 ? 'y' : 'ies'}?
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={bulkActionLoading}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={bulkReject}
                            disabled={bulkActionLoading}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            {bulkActionLoading ? (
                                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Rejecting...</>
                            ) : (
                                `Reject ${selectedIds.size} Properties`
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
