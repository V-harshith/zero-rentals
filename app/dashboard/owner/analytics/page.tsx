"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Eye, Home, TrendingUp, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import Link from "next/link"
import Image from "next/image"
import { withAuth } from "@/lib/with-auth"

interface PropertyAnalytics {
  id: string
  title: string
  city: string
  area: string
  views: number
  status: string
  images: string[]
  created_at: string
}

function OwnerAnalyticsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [properties, setProperties] = useState<PropertyAnalytics[]>([])
  const [loading, setLoading] = useState(true)
  const [hasAnalytics, setHasAnalytics] = useState(false)

  useEffect(() => {
    if (user) {
      checkSubscriptionAndFetchProperties()
    }
  }, [user])

  const checkSubscriptionAndFetchProperties = async () => {
    if (!user) return

    try {
      // Check if user has active premium subscription
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('plan_name, status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .gt('end_date', new Date().toISOString())
        .maybeSingle()

      const isPremium = Boolean(subscription && subscription.plan_name !== 'Free')
      setHasAnalytics(isPremium)

      if (!isPremium) {
        toast.error("Analytics is only available for premium subscribers")
        router.push('/dashboard/owner')
        return
      }

      // Fetch owner's properties with analytics
      const { data, error } = await supabase
        .from('properties')
        .select('id, title, city, area, views, status, images, created_at')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      setProperties(data || [])
    } catch (error) {
      console.error("Error fetching analytics:", error)
      toast.error("Failed to load analytics")
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/50">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background border-b">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/dashboard/owner">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
              <h1 className="text-xl font-bold">Property Analytics</h1>
            </div>
            <Badge variant="secondary" className="bg-green-100 text-green-700">
              Premium Feature
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {properties.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Home className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Properties Yet</h3>
              <p className="text-muted-foreground mb-4">Post your first property to see analytics</p>
              <Link href="/post-property">
                <Button>Post Property</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {properties.map((property) => (
              <Card key={property.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <div className="relative h-48 bg-muted">
                  {property.images && property.images.length > 0 ? (
                    <Image
                      src={property.images[0]}
                      alt={property.title}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Home className="h-16 w-16 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <Badge variant={property.status === 'active' ? 'default' : 'secondary'}>
                      {property.status}
                    </Badge>
                  </div>
                </div>
                <CardHeader>
                  <CardTitle className="line-clamp-1">{property.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {property.area}, {property.city}
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Views */}
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Eye className="h-5 w-5 text-primary" />
                        <span className="font-medium">Total Views</span>
                      </div>
                      <span className="text-2xl font-bold text-primary">
                        {property.views || 0}
                      </span>
                    </div>

                    {/* Posted Date */}
                    <div className="text-sm text-muted-foreground">
                      Posted: {new Date(property.created_at).toLocaleDateString()}
                    </div>

                    {/* Actions */}
                    <Link href={`/property/${property.id}`} target="_blank">
                      <Button variant="outline" className="w-full">
                        View Property
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Summary Stats */}
        {properties.length > 0 && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Overall Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Total Properties</p>
                  <p className="text-3xl font-bold">{properties.length}</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Active Properties</p>
                  <p className="text-3xl font-bold">
                    {properties.filter(p => p.status === 'active').length}
                  </p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Total Views</p>
                  <p className="text-3xl font-bold">
                    {properties.reduce((sum, p) => sum + (p.views || 0), 0)}
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

const ProtectedAnalyticsPage = withAuth(OwnerAnalyticsPage, { requiredRole: 'owner' })

export default ProtectedAnalyticsPage
