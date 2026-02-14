"use client"

import { useState, useEffect } from "react"
import { getPropertyById } from "@/lib/data-service"
import type { Property } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    MapPin,
    Heart,
    Share2,
    Phone,
    Mail,
    Calendar,
    Home,
    Ruler,
    Edit,
    CheckCircle,
    X,
    Eye,
    Shield,
    AlertTriangle,
    Clock,
    XCircle,
    ChevronLeft,
    ChevronRight
} from "lucide-react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { PropertyCard } from "@/components/property-card"
import { toast } from "sonner"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { LocationPermissionModal } from "@/components/location-permission-modal"
import { LoginModal } from "@/components/auth/login-modal"
import { GatedContent } from "@/components/auth/gated-content"
import { LockedButton } from "@/components/auth/locked-button"
import { useAuth } from "@/lib/auth-context"
import { supabase } from "@/lib/supabase"
import { PLAN_FEATURES } from "@/lib/constants"
import { approveProperty, rejectProperty } from "@/lib/data-service"
import { FavoriteButton } from "@/components/favorite-button"

export default function PropertyClientPage({ id, initialProperty }: { id: string, initialProperty: Property | null }) {
    const router = useRouter()
    const { user, isLoading: authLoading } = useAuth()
    const isAdmin = !authLoading && user?.role === 'admin'
    const [property, setProperty] = useState<Property | null>(initialProperty)
    const [loading, setLoading] = useState(!initialProperty)
    const [actionLoading, setActionLoading] = useState(false)
    const [similarProperties, setSimilarProperties] = useState<Property[]>([])
    const [whatsappEnabled, setWhatsappEnabled] = useState(false)
    const [selectedImageIndex, setSelectedImageIndex] = useState(0)

    // Hide public UI while checking if user is an admin to prevent flicker
    const showHeaderFooter = !authLoading && !isAdmin


    useEffect(() => {
        let isMounted = true

        async function loadAdditionalData() {
            try {
                // Use property from state (set from initialProperty)
                const currentProperty = property

                if (!currentProperty) {
                    setLoading(false)
                    return
                }

                // Check Owner Subscription for WhatsApp Access
                if (currentProperty.owner?.id) {
                    const { data: subData, error: subError } = await supabase
                        .from('subscriptions')
                        .select('plan_name, plan_duration')
                        .eq('user_id', currentProperty.owner.id)
                        .eq('status', 'active')
                        .gt('end_date', new Date().toISOString())
                        .maybeSingle() // Use maybeSingle() to handle no subscription case

                    if (isMounted && subData && !subError) {
                        const planName = subData.plan_name || subData.plan_duration
                        const features = PLAN_FEATURES[planName?.toUpperCase() as keyof typeof PLAN_FEATURES]
                        if (features?.whatsappAccess) {
                            setWhatsappEnabled(true)
                        }
                    }

                    // Log subscription errors (except "no rows" which is expected)
                    if (subError && subError.code !== 'PGRST116') {
                        console.warn('Subscription check failed:', subError)
                    }
                }

                // Fetch similar properties in same city with same type
                if (isMounted) {
                    const { searchProperties } = await import('@/lib/data-service')
                    const similar = await searchProperties({
                        location: currentProperty.location.city,
                        propertyType: currentProperty.propertyType
                    })
                    // Filter out current property and limit to 4
                    if (isMounted) {
                        setSimilarProperties(similar.filter(p => p.id !== id).slice(0, 4))
                    }
                }
            } catch (error: any) {
                if (!isMounted) return
                console.error("Error loading additional data:", error)
            } finally {
                if (isMounted) {
                    setLoading(false)
                }
            }
        }

        loadAdditionalData()

        // Cleanup function
        return () => {
            isMounted = false
        }
    }, [id])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto" />
                    <p className="text-muted-foreground">Loading property...</p>
                </div>
            </div>
        )
    }

    if (!property) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center space-y-4">
                    <h1 className="text-4xl font-bold">Property Not Found</h1>
                    <p className="text-muted-foreground">The property you're looking for doesn't exist.</p>
                    <Button asChild>
                        <Link href="/search">Browse Properties</Link>
                    </Button>
                </div>
            </div>
        )
    }

    const handleShare = () => {
        if (navigator.share) {
            navigator.share({
                title: property.title,
                text: property.description,
                url: window.location.href,
            })
        } else {
            navigator.clipboard.writeText(window.location.href)
            toast.success("Link copied to clipboard!")
        }
    }

    return (
        <div className="min-h-screen bg-background flex flex-col">
            {showHeaderFooter && <Header />}
            {/* Toolbar - Only show when auth is ready and user is admin */}
            {!authLoading && isAdmin && (
                <div className={`border-b bg-background sticky top-0 z-30 backdrop-blur-sm bg-background/95`}>
                    <div className="container mx-auto px-4 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 w-full">
                                <Link href="/dashboard/admin" className="text-primary hover:underline flex items-center gap-2 font-medium">
                                    ← Back to Dashboard
                                </Link>
                                <div className="h-4 w-px bg-border mx-2" />
                                <span className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                                    <Shield className="h-4 w-4" />
                                    Admin Preview Mode
                                </span>
                            </div>

                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" asChild>
                                    <Link href={`/property/edit/${id}`}>
                                        <Edit className="h-4 w-4 mr-2" />
                                        Edit Property
                                    </Link>
                                </Button>
                                <Button variant="outline" size="sm" onClick={handleShare}>
                                    <Share2 className="h-4 w-4 mr-2" />
                                    Share
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Public Toolbar - Only show when auth is ready and NOT admin */}
            {!authLoading && !isAdmin && (
                <div className="border-b bg-background sticky top-16 z-30 backdrop-blur-sm bg-background/95">
                    <div className="container mx-auto px-4 py-4">
                        <div className="flex items-center justify-between">
                            <Link href="/search" className="text-primary hover:underline flex items-center gap-2">
                                ← Back to Search
                            </Link>

                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={handleShare}>
                                    <Share2 className="h-4 w-4 mr-2" />
                                    Share
                                </Button>
                                {/* Only show favorite for tenants */}
                                {user?.role === 'tenant' && (
                                    <FavoriteButton 
                                        propertyId={id} 
                                        variant="outline" 
                                        size="sm"
                                    />
                                )}
                                {/* Show locked button for anonymous users */}
                                {!user && (
                                    <LockedButton size="sm" variant="outline" lockedText="Login to Save">
                                        <Heart className="h-4 w-4 mr-2" />
                                        Save
                                    </LockedButton>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Admin Action Banner */}
            {user?.role === 'admin' && property.status === 'pending' && (
                <div className="bg-yellow-50 border-b border-yellow-200 sticky top-16 z-40 px-4 py-3">
                    <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3 text-yellow-800">
                            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                            <div>
                                <p className="font-semibold">Pending Approval</p>
                                <p className="text-sm">Review this property and update its status.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <Button
                                variant="destructive"
                                size="sm"
                                disabled={actionLoading}
                                className="flex-1 sm:flex-none gap-2"
                                onClick={async () => {
                                    if (confirm('Are you sure you want to reject this property?')) {
                                        setActionLoading(true)
                                        try {
                                            const { error } = await rejectProperty(property.id)
                                            if (error) throw error
                                            toast.success('Property rejected')
                                            router.push('/dashboard/admin')
                                        } catch (err: any) {
                                            toast.error('Failed to reject property: ' + (err.message || 'Unknown error'))
                                        } finally {
                                            setActionLoading(false)
                                        }
                                    }
                                }}
                            >
                                <XCircle className="h-4 w-4" />
                                {actionLoading ? 'Processing...' : 'Reject'}
                            </Button>
                            <Button
                                className="flex-1 sm:flex-none gap-2 bg-green-600 hover:bg-green-700 text-white"
                                size="sm"
                                disabled={actionLoading}
                                onClick={async () => {
                                    setActionLoading(true)
                                    try {
                                        const { error } = await approveProperty(property.id)
                                        if (error) throw error
                                        toast.success('Property approved successfully')
                                        setProperty(prev => prev ? ({ ...prev, status: 'active', availability: 'Available' }) : null)
                                    } catch (err: any) {
                                        toast.error('Failed to approve property: ' + (err.message || 'Unknown error'))
                                    } finally {
                                        setActionLoading(false)
                                    }
                                }}
                            >
                                <CheckCircle className="h-4 w-4" />
                                {actionLoading ? 'Processing...' : 'Approve'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Owner Pending Status Alert */}
            {user?.id === property.owner.id && property.status === 'pending' && user?.role !== 'admin' && (
                <div className="bg-blue-50 border-b border-blue-100 p-4">
                    <div className="container mx-auto flex items-center gap-3 text-blue-800">
                        <div className="p-2 bg-blue-100 rounded-full">
                            <Clock className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="font-semibold">Under Review</p>
                            <p className="text-sm">Your property is currently waiting for admin approval. It is not visible to the public yet.</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="container mx-auto px-4 py-8 flex-1">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Image Gallery */}
                        <Card>
                            <CardContent className="p-0">
                                <div className="relative h-64 sm:h-80 md:h-96 bg-gray-200 rounded-t-lg flex items-center justify-center overflow-hidden group">
                                    {property.images && property.images.length > 0 ? (
                                        <Image
                                            src={property.images[selectedImageIndex]}
                                            alt={property.title}
                                            fill
                                            priority
                                            className="w-full h-full object-cover transition-opacity duration-300"
                                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 70vw, 800px"
                                        />
                                    ) : (
                                        <span className="text-gray-400">No Image Available</span>
                                    )}
                                    <div className="absolute top-4 left-4 flex gap-2 z-10">
                                        <Badge className="bg-primary">{property.propertyType}</Badge>
                                        {property.featured && (
                                            <Badge className="bg-accent">Featured</Badge>
                                        )}
                                    </div>
                                    {/* Image Navigation Arrows */}
                                    {property.images && property.images.length > 1 && (
                                        <>
                                            <button
                                                onClick={() => setSelectedImageIndex(prev => prev === 0 ? property.images!.length - 1 : prev - 1)}
                                                className="absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                                aria-label="Previous image"
                                            >
                                                <ChevronLeft className="h-5 w-5" />
                                            </button>
                                            <button
                                                onClick={() => setSelectedImageIndex(prev => prev === property.images!.length - 1 ? 0 : prev + 1)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                                aria-label="Next image"
                                            >
                                                <ChevronRight className="h-5 w-5" />
                                            </button>
                                            {/* Image counter */}
                                            <div className="absolute bottom-4 right-4 z-10 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
                                                {selectedImageIndex + 1} / {property.images.length}
                                            </div>
                                        </>
                                    )}
                                </div>
                                {/* Thumbnail images - gated for non-logged-in users */}
                                {property.images && property.images.length > 1 && (
                                    <GatedContent
                                        requireAuth={true}
                                        message="Login to View All Photos"
                                        description={`View all ${property.images.length} photos of this property`}
                                        blurAmount="lg"
                                    >
                                        <div className="grid grid-cols-4 gap-2 p-4">
                                            {property.images.slice(0, 4).map((img, i) => (
                                                <div 
                                                    key={i} 
                                                    onClick={() => setSelectedImageIndex(i)}
                                                    className={`relative h-20 bg-gray-100 rounded cursor-pointer hover:opacity-75 transition-all overflow-hidden ${
                                                        selectedImageIndex === i ? 'ring-2 ring-primary ring-offset-2' : ''
                                                    }`}
                                                >
                                                    <Image
                                                        src={img}
                                                        alt={`Property ${i + 1}`}
                                                        fill
                                                        className="w-full h-full object-cover"
                                                        sizes="(max-width: 768px) 25vw, 150px"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        {/* More images if available */}
                                        {property.images.length > 4 && (
                                            <div className="grid grid-cols-4 gap-2 p-4 pt-0">
                                                {property.images.slice(4).map((img, i) => (
                                                    <div 
                                                        key={i + 4} 
                                                        onClick={() => setSelectedImageIndex(i + 4)}
                                                        className={`relative h-20 bg-gray-100 rounded cursor-pointer hover:opacity-75 transition-all overflow-hidden ${
                                                            selectedImageIndex === i + 4 ? 'ring-2 ring-primary ring-offset-2' : ''
                                                        }`}
                                                    >
                                                        <Image
                                                            src={img}
                                                            alt={`Property ${i + 5}`}
                                                            fill
                                                            className="w-full h-full object-cover"
                                                            sizes="(max-width: 768px) 25vw, 150px"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </GatedContent>
                                )}
                            </CardContent>
                        </Card>

                        {/* Property Details */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="space-y-2">
                                        <CardTitle className="text-3xl">{property.title}</CardTitle>
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <MapPin className="h-4 w-4" />
                                            <span>{property.location?.address || "Address not available"}</span>
                                        </div>
                                    </div>
                                    <Badge
                                        className={
                                            property.availability === "Available"
                                                ? "bg-green-500 hover:bg-green-600"
                                                : "bg-gray-500"
                                        }
                                    >
                                        {property.availability}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {/* Price Section */}
                                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                                    <div>
                                        <div className="text-3xl font-bold text-primary">
                                            ₹{property.price.toLocaleString()}
                                        </div>
                                        <div className="text-sm text-muted-foreground">per month{property.roomPrices && Object.keys(property.roomPrices).length > 1 ? ' (starting from)' : ''}</div>
                                    </div>
                                    <div className="text-right space-y-1">
                                        {property.deposit && (
                                            <div className="text-sm">
                                                <span className="text-muted-foreground">Deposit:</span>{" "}
                                                <span className="font-semibold">₹{property.deposit.toLocaleString()}</span>
                                            </div>
                                        )}
                                        {property.maintenance && (
                                            <div className="text-sm">
                                                <span className="text-muted-foreground">Maintenance:</span>{" "}
                                                <span className="font-semibold">₹{property.maintenance.toLocaleString()}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Multi-Room Pricing */}
                                {property.roomPrices && Object.keys(property.roomPrices).length > 1 && (
                                    <div>
                                        <h3 className="text-lg font-semibold mb-3">Room-wise Pricing</h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                            {Object.entries(property.roomPrices)
                                                .sort(([, a], [, b]) => a - b)
                                                .map(([type, price]) => {
                                                    const label: Record<string, string> = {
                                                        '1rk': '1 RK', single: 'Single', double: 'Double',
                                                        triple: 'Triple', four: 'Four Sharing'
                                                    }
                                                    return (
                                                        <div key={type} className="p-3 border rounded-lg text-center bg-background hover:border-primary/50 transition-colors">
                                                            <div className="text-xs text-muted-foreground mb-1">{label[type] || type}</div>
                                                            <div className="text-lg font-bold text-primary">₹{price.toLocaleString()}</div>
                                                            <div className="text-xs text-muted-foreground">/month</div>
                                                        </div>
                                                    )
                                                })}
                                        </div>
                                    </div>
                                )}

                                {/* Quick Info */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="text-center p-3 bg-muted rounded-lg">
                                        <Home className="h-5 w-5 mx-auto mb-2 text-primary" />
                                        <div className="text-sm font-semibold">{property.roomType}</div>
                                        <div className="text-xs text-muted-foreground">Room Type</div>
                                    </div>
                                    {property.roomSize && (
                                        <div className="text-center p-3 bg-muted rounded-lg">
                                            <Ruler className="h-5 w-5 mx-auto mb-2 text-primary" />
                                            <div className="text-sm font-semibold">{property.roomSize} sqft</div>
                                            <div className="text-xs text-muted-foreground">Area</div>
                                        </div>
                                    )}
                                    {property.furnishing && (
                                        <div className="text-center p-3 bg-muted rounded-lg">
                                            <Home className="h-5 w-5 mx-auto mb-2 text-primary" />
                                            <div className="text-sm font-semibold">{property.furnishing}</div>
                                            <div className="text-xs text-muted-foreground">Furniture Type</div>
                                        </div>
                                    )}
                                    {property.floorNumber && (
                                        <div className="text-center p-3 bg-muted rounded-lg">
                                            <Home className="h-5 w-5 mx-auto mb-2 text-primary" />
                                            <div className="text-sm font-semibold">
                                                {property.floorNumber}/{property.totalFloors}
                                            </div>
                                            <div className="text-xs text-muted-foreground">Floor</div>
                                        </div>
                                    )}
                                </div>

                                {/* Description */}
                                <div>
                                    <h3 className="text-lg font-semibold mb-3">Description</h3>
                                    <p className="text-muted-foreground leading-relaxed">
                                        {property.description}
                                    </p>
                                </div>

                                {/* Amenities */}
                                <div>
                                    <h3 className="text-lg font-semibold mb-3">Amenities</h3>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        {property.amenities.map((amenity, index) => (
                                            <div key={index} className="flex items-center gap-2">
                                                <CheckCircle className="h-4 w-4 text-green-500" />
                                                <span className="text-sm">{amenity}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Rules */}
                                {property.rules && property.rules.length > 0 && (
                                    <div>
                                        <h3 className="text-lg font-semibold mb-3">Rules & Policies</h3>
                                        <div className="space-y-2">
                                            {property.rules.map((rule, index) => (
                                                <div key={index} className="flex items-center gap-2">
                                                    <X className="h-4 w-4 text-red-500" />
                                                    <span className="text-sm">{rule}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Nearby Places */}
                                {property.nearbyPlaces && property.nearbyPlaces.length > 0 && (
                                    <div>
                                        <h3 className="text-lg font-semibold mb-3">Nearby Places</h3>
                                        <div className="space-y-2">
                                            {property.nearbyPlaces.map((place, index) => (
                                                <div key={index} className="flex items-center gap-2">
                                                    <MapPin className="h-4 w-4 text-primary" />
                                                    <span className="text-sm">{place}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Stats */}
                                <div className="flex items-center gap-4 pt-4 border-t text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <Eye className="h-4 w-4" />
                                        <span>{property.views} views</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Calendar className="h-4 w-4" />
                                        <span>Posted {new Date(property.postedDate).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Sidebar */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* Owner Card */}
                        <Card className="lg:sticky lg:top-24">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Home className="h-5 w-5" />
                                    Property Owner
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                        <span className="text-lg font-semibold text-primary">
                                            {property.owner.name.charAt(0)}
                                        </span>
                                    </div>
                                    <div>
                                        <div className="font-semibold flex items-center gap-2">
                                            {property.owner.name}
                                            {property.owner.verified && (
                                                <Shield className="h-4 w-4 text-green-500" />
                                            )}
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            {property.owner.verified ? "Verified Owner" : "Owner"}
                                        </div>
                                    </div>
                                </div>

                                {/* Contact Details - Gated for tenants only */}
                                <GatedContent
                                    requireAuth={true}
                                    requireRole="tenant"
                                    message="Login to View Contact Details"
                                    description="Direct contact with property owner"
                                    blurAmount="md"
                                >
                                    <div className="space-y-2">
                                        <LockedButton
                                            requireAuth={true}
                                            requireRole="tenant"
                                            className="w-full"
                                            size="lg"
                                            lockedText="Login to Call Owner"
                                            onClick={() => {
                                                toast.success("Contact Number: " + property.owner.phone)
                                                window.location.href = `tel:${property.owner.phone}`
                                            }}
                                        >
                                            <Phone className="h-4 w-4 mr-2" />
                                            Call Owner
                                        </LockedButton>
                                        <LockedButton
                                            requireAuth={true}
                                            requireRole="tenant"
                                            variant="outline"
                                            className="w-full text-green-600 hover:text-green-700 hover:bg-green-50"
                                            size="lg"
                                            lockedText="Login for WhatsApp"
                                            onClick={() => {
                                                window.open(`https://wa.me/${property.owner.phone.replace(/[^0-9]/g, '')}`, '_blank')
                                            }}
                                        >
                                            <svg
                                                viewBox="0 0 24 24"
                                                width="16"
                                                height="16"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                fill="none"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                className="mr-2"
                                            >
                                                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                                            </svg>
                                            WhatsApp
                                            WhatsApp
                                        </LockedButton>
                                    </div>

                                </GatedContent>

                                <div className="pt-4 border-t text-xs text-muted-foreground text-center">
                                    By contacting, you agree to our Terms & Privacy Policy
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Similar Properties */}
                {similarProperties.length > 0 && (
                    <div className="mt-12">
                        <h2 className="text-2xl font-bold mb-6">Similar Properties</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {similarProperties.map((prop) => (
                                <PropertyCard key={prop.id} property={prop} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
            {showHeaderFooter && <Footer />}
            {/* Only show location modal for tenants and anonymous users */}
            {(!user || user.role === 'tenant') && <LocationPermissionModal />}
            {/* Login Modal */}
            <LoginModal />
        </div>
    )
}
