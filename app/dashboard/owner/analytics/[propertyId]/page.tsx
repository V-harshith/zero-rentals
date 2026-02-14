"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Eye, Calendar, TrendingUp, Lock, BarChart3, Users, Clock, MapPin } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import Link from "next/link"
import Image from "next/image"
import { withAuth } from "@/lib/with-auth"

interface PropertyDetails {
    id: string
    title: string
    city: string
    area: string
    views: number
    status: string
    images: string[]
    created_at: string
    payment_status: string | null
    payment_expires_at: string | null
    property_type: string
    price: number
}

interface ViewStats {
    today: number
    thisWeek: number
    thisMonth: number
    total: number
}

function PropertyAnalyticsPage() {
    const router = useRouter()
    const params = useParams()
    const propertyId = params?.propertyId as string
    const { user, loading: authLoading } = useAuth()
    
    const [property, setProperty] = useState<PropertyDetails | null>(null)
    const [viewStats, setViewStats] = useState<ViewStats>({ today: 0, thisWeek: 0, thisMonth: 0, total: 0 })
    const [isLoading, setIsLoading] = useState(true)
    const [isPremium, setIsPremium] = useState(false)
    const [hasAnalyticsAccess, setHasAnalyticsAccess] = useState(false)

    useEffect(() => {
        if (!authLoading && user && propertyId) {
            fetchPropertyAnalytics()
        }
    }, [user, authLoading, propertyId])

    const fetchPropertyAnalytics = async () => {
        if (!user || !propertyId) return

        // Validate propertyId format (UUID)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (!uuidRegex.test(propertyId)) {
            toast.error('Invalid property ID')
            router.push('/dashboard/owner')
            return
        }

        setIsLoading(true)

        try {
            // 1. Fetch property details with ownership verification
            const { data: propertyData, error: propError } = await supabase
                .from('properties')
                .select('id, title, city, area, views, status, images, created_at, payment_status, payment_expires_at, property_type, price, owner_id')
                .eq('id', propertyId)
                .single()

            // Defense-in-depth: Explicit ownership check
            if (propError || !propertyData || propertyData.owner_id !== user.id) {
                toast.error('Property not found or access denied')
                router.push('/dashboard/owner')
                return
            }

            setProperty(propertyData)

            // 2. Check subscription status
            const { data: subscription } = await supabase
                .from('subscriptions')
                .select('plan_name, status')
                .eq('user_id', user.id)
                .eq('status', 'active')
                .gt('end_date', new Date().toISOString())
                .maybeSingle()

            const hasPaidSubscription = subscription && subscription.plan_name !== 'Free'
            setIsPremium(hasPaidSubscription || false)

            // 3. Check if property has analytics access
            // First property gets analytics with paid subscription
            // Additional properties get analytics if they have payment_status = 'paid'
            const { count: propertyIndex } = await supabase
                .from('properties')
                .select('*', { count: 'exact', head: true })
                .eq('owner_id', user.id)
                .lte('created_at', propertyData.created_at)

            const isFirstProperty = propertyIndex === 1
            const isPaidProperty = propertyData.payment_status === 'paid'
            
            // Analytics access: paid subscription + (first property OR paid additional property)
            const canAccessAnalytics = Boolean(hasPaidSubscription && (isFirstProperty || isPaidProperty))
            setHasAnalyticsAccess(canAccessAnalytics)

            // 4. Fetch view statistics (if access granted)
            if (canAccessAnalytics) {
                const now = new Date()
                const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000)
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

                // Get daily views from property_views table if exists
                const { data: viewsData } = await supabase
                    .from('property_views')
                    .select('viewed_at')
                    .eq('property_id', propertyId)

                if (viewsData) {
                    const todayViews = viewsData.filter(v => new Date(v.viewed_at) >= todayStart).length
                    const weekViews = viewsData.filter(v => new Date(v.viewed_at) >= weekStart).length
                    const monthViews = viewsData.filter(v => new Date(v.viewed_at) >= monthStart).length

                    setViewStats({
                        today: todayViews,
                        thisWeek: weekViews,
                        thisMonth: monthViews,
                        total: propertyData.views || 0
                    })
                } else {
                    // Fallback to total views only
                    setViewStats({
                        today: 0,
                        thisWeek: 0,
                        thisMonth: 0,
                        total: propertyData.views || 0
                    })
                }
            }

        } catch (error) {
            console.error('Error fetching analytics:', error)
            toast.error('Failed to load analytics')
        } finally {
            setIsLoading(false)
        }
    }

    if (authLoading || isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 p-4 md:p-8">
                <div className="max-w-6xl mx-auto space-y-6">
                    <Skeleton className="h-8 w-48" />
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map(i => (
                            <Skeleton key={i} className="h-32" />
                        ))}
                    </div>
                    <Skeleton className="h-64" />
                </div>
            </div>
        )
    }

    if (!property) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Card className="max-w-md">
                    <CardContent className="pt-6 text-center">
                        <p>Property not found</p>
                        <Button onClick={() => router.push('/dashboard/owner')} className="mt-4">
                            Back to Dashboard
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // If no analytics access, show upgrade prompt
    if (!hasAnalyticsAccess) {
        return (
            <div className="min-h-screen bg-gray-50 p-4 md:p-8">
                <div className="max-w-2xl mx-auto">
                    <Button variant="ghost" onClick={() => router.back()} className="mb-6">
                        <ArrowLeft className="h-4 w-4 mr-2" /> Back
                    </Button>

                    <Card className="border-2 border-dashed border-gray-300">
                        <CardContent className="pt-12 pb-12 text-center space-y-6">
                            <div className="w-20 h-20 bg-gradient-to-br from-purple-400 to-indigo-500 rounded-full flex items-center justify-center mx-auto">
                                <Lock className="h-10 w-10 text-white" />
                            </div>
                            
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                                    Analytics Locked
                                </h2>
                                <p className="text-gray-600 max-w-md mx-auto">
                                    {!isPremium 
                                        ? "Upgrade to a paid plan to unlock detailed analytics for your properties."
                                        : "This is an additional property. Pay to unlock analytics for this listing."
                                    }
                                </p>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-4 text-left max-w-sm mx-auto">
                                <h3 className="font-semibold mb-2">Analytics includes:</h3>
                                <ul className="text-sm text-gray-600 space-y-1">
                                    <li>• Daily, weekly, monthly views</li>
                                    <li>• View trends over time</li>
                                    <li>• Inquiry statistics</li>
                                    <li>• Performance insights</li>
                                </ul>
                            </div>

                            <Button 
                                className="bg-primary hover:bg-primary/90"
                                onClick={() => router.push(isPremium ? '/post-property' : '/pricing')}
                            >
                                {isPremium ? 'Pay for This Property' : 'View Plans & Upgrade'}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" onClick={() => router.back()}>
                            <ArrowLeft className="h-4 w-4 mr-2" /> Back
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">{property.title}</h1>
                            <p className="text-gray-500 flex items-center gap-1">
                                <MapPin className="h-4 w-4" />
                                {property.area}, {property.city}
                            </p>
                        </div>
                    </div>
                    {property.images?.[0] && (
                        <Image 
                            src={property.images[0]} 
                            alt={property.title}
                            width={80}
                            height={60}
                            className="rounded-lg object-cover"
                        />
                    )}
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-500">Today</p>
                                    <p className="text-3xl font-bold">{viewStats.today}</p>
                                </div>
                                <div className="p-3 bg-blue-100 rounded-full">
                                    <Eye className="h-6 w-6 text-blue-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-500">This Week</p>
                                    <p className="text-3xl font-bold">{viewStats.thisWeek}</p>
                                </div>
                                <div className="p-3 bg-green-100 rounded-full">
                                    <TrendingUp className="h-6 w-6 text-green-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-500">This Month</p>
                                    <p className="text-3xl font-bold">{viewStats.thisMonth}</p>
                                </div>
                                <div className="p-3 bg-purple-100 rounded-full">
                                    <BarChart3 className="h-6 w-6 text-purple-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-500">Total Views</p>
                                    <p className="text-3xl font-bold">{viewStats.total}</p>
                                </div>
                                <div className="p-3 bg-orange-100 rounded-full">
                                    <Users className="h-6 w-6 text-orange-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Property Info Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>Property Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div>
                                <p className="text-sm text-gray-500">Type</p>
                                <p className="font-semibold">{property.property_type}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Price</p>
                                <p className="font-semibold">₹{property.price?.toLocaleString()}/mo</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Status</p>
                                <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                                    property.status === 'active' 
                                        ? 'bg-green-100 text-green-700' 
                                        : 'bg-yellow-100 text-yellow-700'
                                }`}>
                                    {property.status}
                                </span>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Listed On</p>
                                <p className="font-semibold">{new Date(property.created_at).toLocaleDateString()}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Payment Status (for additional properties) */}
                {property.payment_status === 'paid' && property.payment_expires_at && (
                    <Card className="border-blue-200 bg-blue-50">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <Clock className="h-5 w-5 text-blue-600" />
                                <div>
                                    <p className="font-semibold text-blue-900">Paid Property</p>
                                    <p className="text-sm text-blue-700">
                                        Expires: {new Date(property.payment_expires_at).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    )
}

const ProtectedPropertyAnalyticsPage = withAuth(PropertyAnalyticsPage, { requiredRole: 'owner' })

export default ProtectedPropertyAnalyticsPage
