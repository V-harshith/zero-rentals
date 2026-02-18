"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Star, CheckCircle, XCircle, ExternalLink, Loader2, Trash2, Pencil, Eye } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { mapPropertyFromDB, type PropertyRow } from "@/lib/data-mappers"
import { type Property } from "@/lib/types"
import { toast } from "sonner"
import Link from "next/link"
import { useCsrf } from "@/lib/csrf-context"

const STORAGE_KEY = 'adminAllPropertiesTab_state'

export function AllPropertiesTab() {
    const [properties, setProperties] = useState<Property[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [updatingId, setUpdatingId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [totalCount, setTotalCount] = useState(0)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [bulkDeleting, setBulkDeleting] = useState(false)
    const { csrfToken, isLoading: isCsrfLoading } = useCsrf()
    const ITEMS_PER_PAGE = 20

    // Restore state from sessionStorage on mount
    useEffect(() => {
        const saved = sessionStorage.getItem(STORAGE_KEY)
        if (saved) {
            try {
                const { searchQuery: savedSearch, currentPage: savedPage, timestamp } = JSON.parse(saved)
                // Check if saved within last 30 minutes
                if (Date.now() - timestamp < 30 * 60 * 1000) {
                    setSearchQuery(savedSearch || "")
                    setCurrentPage(savedPage || 1)
                }
                sessionStorage.removeItem(STORAGE_KEY)
            } catch {
                // Invalid JSON, ignore
            }
        }
    }, [])

    // Ref to track mounted state for cleanup
    const isMountedRef = useRef(true)

    useEffect(() => {
        isMountedRef.current = true
        return () => {
            isMountedRef.current = false
        }
    }, [])

    const fetchProperties = useCallback(async () => {
        try {
            setLoading(true)
            const from = (currentPage - 1) * ITEMS_PER_PAGE
            const to = from + ITEMS_PER_PAGE - 1

            const { data, error, count } = await supabase
                .from('properties')
                .select('id, title, city, area, locality, owner_name, owner_contact, private_room_price, double_sharing_price, triple_sharing_price, four_sharing_price, room_type, property_type, featured, verified, status, created_at, images, views', { count: 'exact' })
                .order('created_at', { ascending: false })
                .range(from, to)

            if (!isMountedRef.current) return

            if (error) {
                throw error
            }

            setProperties((data || []).map((p: any) => mapPropertyFromDB(p as PropertyRow)))
            setTotalCount(count || 0)
        } catch {
            if (isMountedRef.current) {
                toast.error("Failed to load properties. Please try refreshing.")
            }
        } finally {
            if (isMountedRef.current) {
                setLoading(false)
            }
        }
    }, [currentPage])

    useEffect(() => {
        fetchProperties()

        // Add visibility change listener for auto-refresh when tab becomes visible
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                fetchProperties()
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)

        // Cleanup function to handle component unmount
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [fetchProperties])

    const toggleFeatured = async (id: string, current: boolean) => {
        // Check for CSRF token before making request
        if (!csrfToken) {
            toast.error('Security token not available. Please wait a moment and try again.')
            return
        }

        try {
            setUpdatingId(id)

            // Call the admin API endpoint to toggle featured status
            const response = await fetch(`/api/admin/properties/${id}/feature`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-csrf-token': csrfToken,
                },
                body: JSON.stringify({ featured: !current }),
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to update featured status')
            }

            setProperties(prev => prev.map(p => p.id === id ? { ...p, featured: !current } : p))
            toast.success(current ? "Property unfeatured" : "Property featured!")
        } catch (error: any) {
            toast.error(error.message || "Failed to update featured status")
        } finally {
            setUpdatingId(null)
        }
    }

    const toggleVerified = async (id: string, current: boolean) => {
        // Check for CSRF token before making request
        if (!csrfToken) {
            toast.error('Security token not available. Please wait a moment and try again.')
            return
        }

        try {
            setUpdatingId(id)

            // Call the admin API endpoint to toggle verified status
            const response = await fetch(`/api/admin/properties/${id}/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-csrf-token': csrfToken,
                },
                body: JSON.stringify({ verified: !current }),
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to update verification status')
            }

            setProperties(prev => prev.map(p => p.id === id ? { ...p, verified: !current } : p))
            toast.success(current ? "Verification removed" : "Property verified!")
        } catch (error: any) {
            toast.error(error.message || "Failed to update verification")
        } finally {
            setUpdatingId(null)
        }
    }

    const changePropertyType = async (id: string, newType: 'PG' | 'Co-living' | 'Rent') => {
        // Check for CSRF token before making request
        if (!csrfToken) {
            toast.error('Security token not available. Please wait a moment and try again.')
            return
        }

        try {
            setUpdatingId(id)

            // Call the admin API endpoint to change property type
            const response = await fetch(`/api/admin/properties/${id}/type`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-csrf-token': csrfToken,
                },
                body: JSON.stringify({ property_type: newType }),
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to update property type')
            }

            setProperties(prev => prev.map(p =>
                p.id === id ? { ...p, propertyType: newType } : p
            ))
            toast.success(`Property type changed to ${newType}`)
        } catch (error: any) {
            toast.error(error.message || "Failed to update property type")
        } finally {
            setUpdatingId(null)
        }
    }

    const deleteProperty = async (id: string, title: string) => {
        // Check for CSRF token before making request
        if (!csrfToken) {
            toast.error('Security token not available. Please wait a moment and try again.')
            return
        }

        // Confirmation dialog
        const confirmed = window.confirm(
            `Are you sure you want to delete "${title}"?\n\nThis action cannot be undone. The property will be permanently removed from the database.`
        )

        if (!confirmed) return

        try {
            setDeletingId(id)

            // Call the admin API endpoint to delete property
            const response = await fetch(`/api/admin/properties/${id}/delete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-csrf-token': csrfToken,
                },
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to delete property')
            }

            // Optimistic UI update - remove from list
            setProperties(prev => prev.filter(p => p.id !== id))
            setTotalCount(prev => prev - 1)

            toast.success("Property deleted successfully")
        } catch (error: any) {
            toast.error(error.message || "Failed to delete property")
            // Refresh to restore correct state
            fetchProperties()
        } finally {
            setDeletingId(null)
        }
    }

    const filteredProperties = properties.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.location.area.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.location.city.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Save state before navigating to property detail
    const saveState = () => {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            searchQuery,
            currentPage,
            timestamp: Date.now()
        }))
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

    const bulkDelete = async () => {
        if (selectedIds.size === 0) return

        // Check for CSRF token before making request
        if (!csrfToken) {
            toast.error('Security token not available. Please wait a moment and try again.')
            return
        }

        const count = selectedIds.size
        const confirmed = window.confirm(
            `Are you sure you want to delete ${count} propert${count === 1 ? 'y' : 'ies'}?\n\nThis action cannot be undone.`
        )
        if (!confirmed) return

        setBulkDeleting(true)
        try {
            const ids = Array.from(selectedIds)

            // Call the admin API endpoint to bulk delete properties
            const response = await fetch('/api/admin/properties/bulk-delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-csrf-token': csrfToken,
                },
                body: JSON.stringify({ ids }),
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to delete properties')
            }

            const result = await response.json()

            // Immediate UI update
            setProperties(prev => prev.filter(p => !selectedIds.has(p.id)))
            setTotalCount(prev => prev - count)
            setSelectedIds(new Set())
            toast.success(`${result.data?.deletedCount || count} propert${count === 1 ? 'y' : 'ies'} deleted successfully`)
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete properties')
            fetchProperties()
        } finally {
            setBulkDeleting(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search all properties..."
                        className="pl-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3">
                    <div className="text-sm text-muted-foreground">
                        {totalCount} total
                    </div>
                    <Button variant="outline" size="sm" onClick={fetchProperties} className="whitespace-nowrap">
                        <span className="hidden sm:inline">Refresh</span>
                        <span className="sm:hidden">Reload</span>
                    </Button>
                </div>
            </div>

            {/* Bulk Delete Action Bar */}
            {selectedIds.size > 0 && (
                <div className="flex items-center justify-between bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
                    <span className="text-sm font-medium text-destructive">
                        {selectedIds.size} propert{selectedIds.size === 1 ? 'y' : 'ies'} selected
                    </span>
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={bulkDelete}
                        disabled={bulkDeleting || isCsrfLoading}
                    >
                        {bulkDeleting ? (
                            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Deleting...</>
                        ) : (
                            <><Trash2 className="h-4 w-4 mr-2" /> Delete Selected ({selectedIds.size})</>
                        )}
                    </Button>
                </div>
            )}

            {/* Desktop Table - Hidden on mobile */}
            <div className="hidden md:block">
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[40px]">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                                                checked={filteredProperties.length > 0 && selectedIds.size === filteredProperties.length}
                                                onChange={toggleSelectAll}
                                            />
                                        </TableHead>
                                        <TableHead>Property</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Location</TableHead>
                                        <TableHead>Owner</TableHead>
                                        <TableHead>Views</TableHead>
                                        <TableHead>Featured</TableHead>
                                        <TableHead>Verified</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                                        Loading properties...
                                    </TableCell>
                                </TableRow>
                            ) : filteredProperties.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                                        No properties found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredProperties.map((property) => (
                                    <TableRow key={property.id} className={selectedIds.has(property.id) ? 'bg-muted/50' : ''}>
                                        <TableCell>
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                                                checked={selectedIds.has(property.id)}
                                                onChange={() => toggleSelect(property.id)}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium line-clamp-1">{property.title}</div>
                                            <div className="text-xs text-muted-foreground">₹{property.price.toLocaleString()} / mo</div>
                                        </TableCell>
                                        <TableCell>
                                            <Select
                                                value={property.propertyType}
                                                onValueChange={(value) => changePropertyType(property.id, value as 'PG' | 'Co-living' | 'Rent')}
                                                disabled={updatingId === property.id || isCsrfLoading}
                                            >
                                                <SelectTrigger className="w-[100px] h-8">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="PG">PG</SelectItem>
                                                    <SelectItem value="Rent">Rent</SelectItem>
                                                    <SelectItem value="Co-living">Co-living</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm">{property.location?.area || "Unknown Area"}</div>
                                            <div className="text-xs text-muted-foreground">{property.location?.city || "Unknown City"}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm">{property.owner?.name || 'Unknown'}</div>
                                            <div className="text-xs text-muted-foreground">{property.owner?.phone || 'N/A'}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1 text-sm">
                                                <Eye className="h-3 w-3 text-muted-foreground" />
                                                <span>{property.views || 0}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                size="sm"
                                                variant={property.featured ? "default" : "outline"}
                                                className={property.featured ? "bg-yellow-500 hover:bg-yellow-600 border-yellow-500" : ""}
                                                onClick={() => toggleFeatured(property.id, property.featured)}
                                                disabled={updatingId === property.id || isCsrfLoading}
                                                title={property.featured ? "Click to unfeature" : "Click to feature"}
                                            >
                                                <Star className={`h-4 w-4 ${property.featured ? "fill-white" : ""}`} />
                                            </Button>
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                size="sm"
                                                variant={property.verified ? "secondary" : "outline"}
                                                className={property.verified ? "bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200" : ""}
                                                onClick={() => toggleVerified(property.id, property.verified ?? false)}
                                                disabled={updatingId === property.id || isCsrfLoading}
                                                title={property.verified ? "Click to unverify" : "Click to verify"}
                                            >
                                                <CheckCircle className={`h-4 w-4 ${property.verified ? "text-blue-700" : ""}`} />
                                            </Button>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Link href={`/property/${property.id}`} target="_blank" onClick={saveState}>
                                                    <Button size="sm" variant="ghost" title="View Property">
                                                        <ExternalLink className="h-4 w-4" />
                                                    </Button>
                                                </Link>
                                                <Link href={`/property/edit/${property.id}`} onClick={saveState}>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                        title="Edit Property"
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                </Link>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                    onClick={() => deleteProperty(property.id, property.title)}
                                                    disabled={deletingId === property.id || isCsrfLoading}
                                                    title="Delete Property"
                                                >
                                                    {deletingId === property.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-4 w-4" />
                                                    )}
                                                 </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Mobile Card View - Shown only on mobile */}
            <div className="md:hidden space-y-3">
                {loading ? (
                    <Card className="p-8 text-center text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        Loading properties...
                    </Card>
                ) : filteredProperties.length === 0 ? (
                    <Card className="p-8 text-center text-muted-foreground">
                        No properties found
                    </Card>
                ) : (
                    filteredProperties.map((property) => (
                        <Card key={property.id} className={`p-4 ${selectedIds.has(property.id) ? 'bg-muted/50 border-primary' : ''}`}>
                            <div className="flex items-start gap-3">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-gray-300 cursor-pointer mt-1"
                                    checked={selectedIds.has(property.id)}
                                    onChange={() => toggleSelect(property.id)}
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <h3 className="font-medium text-sm line-clamp-1">{property.title}</h3>
                                            <p className="text-xs text-muted-foreground">₹{property.price.toLocaleString()} / mo</p>
                                        </div>
                                        <Select
                                            value={property.propertyType}
                                            onValueChange={(value) => changePropertyType(property.id, value as 'PG' | 'Co-living' | 'Rent')}
                                            disabled={updatingId === property.id || isCsrfLoading}
                                        >
                                            <SelectTrigger className="w-[80px] h-7 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="PG">PG</SelectItem>
                                                <SelectItem value="Rent">Rent</SelectItem>
                                                <SelectItem value="Co-living">Co-living</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="mt-2 text-xs text-muted-foreground">
                                        <div>{property.location?.area || "Unknown Area"}, {property.location?.city || "Unknown City"}</div>
                                        <div className="mt-1">Owner: {property.owner?.name || 'Unknown'}</div>
                                    </div>

                                    <div className="flex items-center justify-between mt-3 pt-3 border-t">
                                        <div className="flex items-center gap-1">
                                            <Eye className="h-3 w-3 text-muted-foreground" />
                                            <span className="text-xs">{property.views || 0}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                size="sm"
                                                variant={property.featured ? "default" : "outline"}
                                                className={`h-8 w-8 p-0 ${property.featured ? "bg-yellow-500 hover:bg-yellow-600 border-yellow-500" : ""}`}
                                                onClick={() => toggleFeatured(property.id, property.featured)}
                                                disabled={updatingId === property.id || isCsrfLoading}
                                            >
                                                <Star className={`h-3 w-3 ${property.featured ? "fill-white" : ""}`} />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant={property.verified ? "secondary" : "outline"}
                                                className={`h-8 w-8 p-0 ${property.verified ? "bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200" : ""}`}
                                                onClick={() => toggleVerified(property.id, property.verified ?? false)}
                                                disabled={updatingId === property.id || isCsrfLoading}
                                            >
                                                <CheckCircle className={`h-3 w-3 ${property.verified ? "text-blue-700" : ""}`} />
                                            </Button>
                                            <Link href={`/property/${property.id}`} target="_blank" onClick={saveState}>
                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                                    <ExternalLink className="h-3 w-3" />
                                                </Button>
                                            </Link>
                                            <Link href={`/property/edit/${property.id}`} onClick={saveState}>
                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-blue-600">
                                                    <Pencil className="h-3 w-3" />
                                                </Button>
                                            </Link>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 w-8 p-0 text-destructive"
                                                onClick={() => deleteProperty(property.id, property.title)}
                                                disabled={deletingId === property.id || isCsrfLoading}
                                            >
                                                {deletingId === property.id ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-3 w-3" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>

            {/* Pagination Controls */}
            {totalCount > ITEMS_PER_PAGE && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-sm text-muted-foreground order-2 sm:order-1">
                        Page {currentPage} of {Math.ceil(totalCount / ITEMS_PER_PAGE)}
                    </div>
                    <div className="flex gap-2 order-1 sm:order-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1 || loading}
                        >
                            <span className="hidden sm:inline">Previous</span>
                            <span className="sm:hidden">Prev</span>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => p + 1)}
                            disabled={currentPage >= Math.ceil(totalCount / ITEMS_PER_PAGE) || loading}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
