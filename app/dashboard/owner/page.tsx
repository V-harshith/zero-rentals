"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"
import { TrendingUp, LogOut, Menu, Edit, Sparkles, AlertCircle, Star } from "lucide-react"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { mapPropertyFromDB, type PropertyRow } from "@/lib/data-mappers"
import type { Property } from "@/lib/types"
import { toast } from "sonner"
import { handleError } from "@/lib/error-handler"
import { getTierFeatures, type TierFeatures } from "@/lib/subscription-service"
// Import new modular components
import {
  OwnerStats,
  PropertiesTab,
  OwnerSupportPanel,
  SupportPanelSkeleton,
  StatsSkeleton,
} from "@/components/dashboard/owner"
import { withAuth } from "@/lib/with-auth"
import { ErrorBoundary } from "@/components/error-boundary"
import { UpgradeBanner } from "@/components/promotional-banners"
import { DASHBOARD_CONSTANTS, ROUTES } from "@/lib/constants"

interface Subscription {
  id: string
  user_id: string
  plan_name: string
  plan_duration: string
  status: 'active' | 'expired' | 'cancelled'
  start_date: string
  end_date: string
  created_at: string
}

function OwnerDashboard() {
  const { user, logout } = useAuth()
  const [properties, setProperties] = useState<Property[]>([])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeSubscription, setActiveSubscription] = useState<Subscription | null>(null)
  const [tierFeatures, setTierFeatures] = useState<TierFeatures | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch data on mount
  useEffect(() => {
    // CRITICAL: Only fetch data when user is confirmed loaded
    if (!user) {

      return
    }


    fetchOwnerData()
    checkSubscription()
  }, [user])

  // Fetch owner's properties and calculate stats
  const fetchOwnerData = async () => {
    if (!user) return

    try {
      const { data: propertiesData, error } = await supabase
        .from("properties")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })

      if (error) throw error

      const mappedProperties = (propertiesData || []).map(p => mapPropertyFromDB(p as PropertyRow))
      setProperties(mappedProperties)

      // Stats are now calculated via useMemo
    } catch (error) {
      handleError(error, "Failed to load dashboard data")
    } finally {
      setLoading(false)
    }
  }

  // Check subscription status
  async function checkSubscription() {
    if (!user) return

    try {
      const [features, { data: sub }] = await Promise.all([
        getTierFeatures(user.id),
        supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .gt('end_date', new Date().toISOString())
          .order('end_date', { ascending: false })
          .limit(1)
          .maybeSingle() // Use maybeSingle() instead of single() to handle no results
      ])

      setTierFeatures(features)
      if (sub) setActiveSubscription(sub)
    } catch (error) {
      console.error('Failed to check subscription:', error)
      toast.error('Unable to load subscription status. Please refresh.')
    }
  }

  const hasAnalytics = tierFeatures?.planName !== "Free"

  const router = useRouter()

  // Performance: Memoized stats calculations
  const memoizedStats = useMemo(() => {
    const activeProps = properties.filter((p) => p.availability === "Available")
    const totalViews = properties.reduce((sum, p) => sum + (p.views || 0), 0)
    const avgViews = properties.length > 0 ? Math.round(totalViews / properties.length) : 0

    return {
      activeProperties: activeProps.length,
      totalViews,
      monthGrowth: avgViews,
    }
  }, [properties])

  // Performance: Memoized top performing property
  const topProperty = useMemo(() => {
    if (properties.length === 0) return null
    const sorted = [...properties].sort((a, b) => (b.views || 0) - (a.views || 0))
    const top = sorted[0]
    return top && top.views && top.views > DASHBOARD_CONSTANTS.TOP_PROPERTY_MIN_VIEWS ? top : null
  }, [properties])

  // Performance: Memoized event handlers
  const handleLogoClick = useCallback(() => {
    router.push(ROUTES.HOME)
  }, [router])

  const handleLogout = useCallback(() => {
    logout()
  }, [logout])

  return (
    <div className="min-h-screen flex flex-col bg-muted/50 overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background border-b">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2 sm:gap-4">
              <div onClick={handleLogoClick} className="flex items-center gap-2 cursor-pointer flex-shrink-0">
                <Image
                  src="/zerorentals-logo.png"
                  alt="ZeroRentals"
                  width={32}
                  height={32}
                  className="h-8 w-8 object-contain"
                />
                <span className="text-xl font-bold hidden sm:inline">ZeroRentals</span>
              </div>
              <Badge variant="outline" className="hidden md:flex">Owner Dashboard</Badge>
              {activeSubscription && (
                <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100 hidden lg:flex">
                  {activeSubscription.plan_name} Plan
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <span className="text-sm text-muted-foreground hidden lg:block">
                Welcome, {user?.name}
              </span>

              {/* Mobile Menu - Contains all nav items in dropdown */}
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="md:hidden">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[280px]">
                  <div className="flex flex-col gap-4 mt-8">
                    <div className="pb-4 border-b">
                      <p className="font-medium">{user?.name}</p>
                      <p className="text-sm text-muted-foreground">{user?.email}</p>
                    </div>

                    <Link href={ROUTES.PROFILE_OWNER} onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="outline" size="sm" className="w-full justify-start">
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Profile
                      </Button>
                    </Link>

                    {hasAnalytics && (
                      <Link href="/dashboard/owner/analytics" onClick={() => setMobileMenuOpen(false)}>
                        <Button variant="outline" size="sm" className="w-full justify-start">
                          <TrendingUp className="h-4 w-4 mr-2" />
                          Analytics
                        </Button>
                      </Link>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setMobileMenuOpen(false)
                        logout()
                      }}
                      className="w-full justify-start bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white hover:text-white"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Logout
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>

              {/* Desktop Only Buttons - Hidden on mobile */}
              <Link href={ROUTES.PROFILE_OWNER} className="hidden md:block">
                <Button variant="outline" size="sm">
                  <Edit className="h-4 w-4 mr-2" />
                  Profile
                </Button>
              </Link>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="hidden md:flex gap-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white hover:text-white"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 flex-1 overflow-x-hidden w-full max-w-full">
        {/* Upgrade Banner for Free Users */}
        {tierFeatures && tierFeatures.planName === "Free" && (
          <div className="mb-6">
            <UpgradeBanner />
          </div>
        )}

        {/* Support Panel for Premium Users */}
        {loading ? (
          <div className="mb-8">
            <SupportPanelSkeleton />
          </div>
        ) : tierFeatures && tierFeatures.planName !== "Free" && (
          <div className="mb-8">
            <OwnerSupportPanel features={tierFeatures} />
          </div>
        )}

        {/* Stats Section */}
        <div className="mb-8">
          {loading ? (
            <StatsSkeleton />
          ) : (
            <OwnerStats
              totalProperties={properties.length}
              activeProperties={memoizedStats.activeProperties}
              totalViews={memoizedStats.totalViews}
              avgViews={memoizedStats.monthGrowth}
              hasAnalytics={hasAnalytics}
            />
          )}
        </div>

        {/* Quick Insights Panel - Only for users with analytics */}
        {hasAnalytics && properties.length > 0 && (
          <div className="mb-8">
            <div className="bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Quick Insights</h3>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Great Performance */}
                {memoizedStats.totalViews > DASHBOARD_CONSTANTS.HIGH_PERFORMANCE_VIEWS_THRESHOLD && (
                  <div className="flex items-start gap-3 bg-background/50 rounded-lg p-4">
                    <TrendingUp className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm">Great Performance!</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Your properties have received {memoizedStats.totalViews} total views
                      </p>
                    </div>
                  </div>
                )}

                {/* Inactive Properties Warning */}
                {memoizedStats.activeProperties < properties.length && (
                  <div className="flex items-start gap-3 bg-background/50 rounded-lg p-4">
                    <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm">Some Properties Inactive</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {properties.length - memoizedStats.activeProperties} {properties.length - memoizedStats.activeProperties === 1 ? 'property is' : 'properties are'} not actively listed
                      </p>
                    </div>
                  </div>
                )}

                {/* Top Performing Property */}
                {topProperty && (
                  <div className="flex items-start gap-3 bg-background/50 rounded-lg p-4">
                    <Star className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm">Top Performer</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        "{topProperty.title.length > 35 ? topProperty.title.slice(0, 35) + '...' : topProperty.title}" with {topProperty.views} views
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Properties Section */}
        <div className="space-y-6">
          <PropertiesTab properties={properties} loading={loading} onRefresh={fetchOwnerData} hasAnalytics={hasAnalytics}
            isPremium={hasAnalytics} />
        </div>
      </div>
    </div>
  )
}

// Protect this route with authentication and wrap with error boundary
const ProtectedOwnerDashboard = withAuth(OwnerDashboard, { requiredRole: 'owner' })

export default function OwnerDashboardPage() {
  return (
    <ErrorBoundary>
      <ProtectedOwnerDashboard />
    </ErrorBoundary>
  )
}
