"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Star, CheckCircle, XCircle, ExternalLink, Loader2, Trash2, Pencil } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { mapPropertyFromDB, type PropertyRow } from "@/lib/data-mappers"
import { type Property } from "@/lib/types"
import { toast } from "sonner"
import Link from "next/link"
import { useCsrf } from "@/lib/csrf-context"

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

    useEffect(() => {
        fetchProperties()

        // Add visibility change listener for auto-refresh when tab becomes visible
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                console.log('[ADMIN] AllPropertiesTab became visible - refreshing data')
                fetchProperties()
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)

        // Cleanup function to handle component unmount
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [currentPage])

    const fetchProperties = async () => {
        try {
            setLoading(true)
            const from = (currentPage - 1) * ITEMS_PER_PAGE
            const to = from + ITEMS_PER_PAGE - 1

            // Fetch properties with optimized query - removed timeout race condition
            // The browser/network will handle actual timeouts
            const { data, error, count } = await supabase
                .from('properties')
                .select('id, title, city, area, locality, owner_name, owner_contact, private_room_price, double_sharing_price, triple_sharing_price, four_sharing_price, room_type, property_type, featured, verified, status, created_at, images', { count: 'exact' })
                .order('created_at', { ascending: false })
                .range(from, to)

            if (error) {
                throw error
            }

            setProperties((data || []).map((p: any) => mapPropertyFromDB(p as PropertyRow)))
            setTotalCount(count || 0)
        } catch {
            toast.error("Failed to load properties. Please try refreshing.")
        } finally {
            setLoading(false)
        }
    }

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
        try {
            setUpdatingId(id)
            // Directly using supabase to ensure 'verified' is updated (if not in Property types yet)
            const { error } = await supabase
                .from('properties')
                .update({ verified: !current })
                .eq('id', id)

            if (error) throw error

            setProperties(prev => prev.map(p => p.id === id ? { ...p, verified: !current } : p))
            toast.success(current ? "Verification removed" : "Property verified!")
        } catch (error) {
            toast.error("Failed to update verification")
        } finally {
            setUpdatingId(null)
        }
    }

    const changePropertyType = async (id: string, newType: 'PG' | 'Co-living' | 'Rent') => {
        try {
            setUpdatingId(id)
            const { error } = await supabase
                .from('properties')
                .update({ property_type: newType })
                .eq('id', id)

            if (error) throw error

            setProperties(prev => prev.map(p => 
                p.id === id ? { ...p, propertyType: newType } : p
            ))
            toast.success(`Property type changed to ${newType}`)
        } catch (error) {
            toast.error("Failed to update property type")
        } finally {
            setUpdatingId(null)
        }
    }

    const deleteProperty = async (id: string, title: string) => {
        // Confirmation dialog
        const confirmed = window.confirm(
            `Are you sure you want to delete "${title}"?\n\nThis action cannot be undone. The property will be permanently removed from the database.`
        )

        if (!confirmed) return

        try {
            setDeletingId(id)
            
            // Delete property from database
            const { error } = await supabase
                .from('properties')
                .delete()
                .eq('id', id)

            if (error) throw error

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
        const count = selectedIds.size
        const confirmed = window.confirm(
            `Are you sure you want to delete ${count} propert${count === 1 ? 'y' : 'ies'}?\n\nThis action cannot be undone.`
        )
        if (!confirmed) return

        setBulkDeleting(true)
        try {
            const ids = Array.from(selectedIds)
            const { error } = await supabase
                .from('properties')
                .delete()
                .in('id', ids)

            if (error) throw error

            // Immediate UI update
            setProperties(prev => prev.filter(p => !selectedIds.has(p.id)))
            setTotalCount(prev => prev - count)
            setSelectedIds(new Set())
            toast.success(`${count} propert${count === 1 ? 'y' : 'ies'} deleted successfully`)
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to delete properties'
            toast.error(message)
            fetchProperties()
        } finally {
            setBulkDeleting(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search all properties..."
                        className="pl-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="text-sm text-muted-foreground">
                    {totalCount} total properties
                </div>
                <Button variant="outline" onClick={fetchProperties}>Refresh</Button>
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
                        disabled={bulkDeleting}
                    >
                        {bulkDeleting ? (
                            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Deleting...</>
                        ) : (
                            <><Trash2 className="h-4 w-4 mr-2" /> Delete Selected ({selectedIds.size})</>
                        )}
                    </Button>
                </div>
            )}

            <Card>
                <CardContent className="p-0">
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
                                <TableHead>Featured</TableHead>
                                <TableHead>Verified</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                                        Loading properties...
                                    </TableCell>
                                </TableRow>
                            ) : filteredProperties.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
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
                                                disabled={updatingId === property.id}
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
                                            <div className="text-sm">{property.owner.name}</div>
                                            <div className="text-xs text-muted-foreground">{property.owner.phone}</div>
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
                                                onClick={() => toggleVerified(property.id, property.verified || false)}
                                                disabled={updatingId === property.id}
                                            >
                                                <CheckCircle className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Link href={`/property/${property.id}`} target="_blank">
                                                    <Button size="sm" variant="ghost" title="View Property">
                                                        <ExternalLink className="h-4 w-4" />
                                                    </Button>
                                                </Link>
                                                <Link href={`/property/edit/${property.id}`}>
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
                                                    disabled={deletingId === property.id}
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
                </CardContent>
            </Card>

            {/* Pagination Controls */}
            {totalCount > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                        Page {currentPage} of {Math.ceil(totalCount / ITEMS_PER_PAGE)}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1 || loading}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
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
