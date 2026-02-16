"use client"

import React, { useEffect, useState, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import { LogOut, Loader2, User, Menu, Edit, Home, Heart } from "lucide-react"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { useAuth } from "@/lib/auth-context"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { getProperties } from "@/lib/data-service"
import type { Property } from "@/lib/types"

// Import modular components
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RecentProperties } from "@/components/dashboard/tenant/RecentProperties"
import { SavedPropertiesTab } from "@/components/dashboard/tenant/SavedPropertiesTab"
import { ErrorBoundary } from "@/components/error-boundary"

import { withAuth } from "@/lib/with-auth"

function TenantDashboard() {
  const { user, logout, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [recentProperties, setRecentProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview')
  const hasLoaded = useRef(false)

  // Sync tab state to URL
  useEffect(() => {
    const currentTab = searchParams.get('tab') || 'overview'
    if (activeTab !== currentTab) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', activeTab)
      router.replace(`/dashboard/tenant?${params.toString()}`, { scroll: false })
    }
  }, [activeTab, searchParams, router])

  useEffect(() => {
    // Skip if still loading auth or already loaded
    if (authLoading || hasLoaded.current) return
    
    // Mark as loaded immediately to prevent re-runs
    hasLoaded.current = true
    
    async function fetchData() {
      if (!user) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const propertiesData = await getProperties()
        setRecentProperties(propertiesData.slice(0, 6))
      } catch {
        toast.error("Failed to load dashboard data")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [authLoading, user])

  return (
    <div className="min-h-screen flex flex-col bg-muted/50 overflow-x-hidden">
      {/* Dashboard Navigation */}
      <div className="sticky top-0 z-40 bg-background border-b">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Left: Mobile Menu + Logo */}
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Mobile Navigation Sheet */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="md:hidden flex-shrink-0">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[300px] sm:w-[340px] p-0">
                  <div className="flex flex-col h-full">
                    {/* User Info Header */}
                    <div className="p-6 border-b bg-muted/30">
                      <p className="font-semibold text-lg">{user?.name}</p>
                      <p className="text-sm text-muted-foreground mt-1">{user?.email}</p>
                      <Badge variant="outline" className="mt-3">Tenant Dashboard</Badge>
                    </div>

                    {/* Navigation Links */}
                    <nav className="flex-1 p-4 space-y-3">
                      <Button
                        variant="outline"
                        className="w-full justify-start gap-3 h-12 text-base"
                        onClick={() => setActiveTab('overview')}
                      >
                        <Home className="h-5 w-5" />
                        Overview
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start gap-3 h-12 text-base"
                        onClick={() => setActiveTab('favorites')}
                      >
                        <Heart className="h-5 w-5" />
                        Favorites
                      </Button>

                      <div className="my-4 border-t" />

                      <Link href="/profile/tenant">
                        <Button
                          variant="outline"
                          className="w-full justify-start gap-3 h-12 text-base"
                        >
                          <Edit className="h-5 w-5" />
                          Edit Profile
                        </Button>
                      </Link>

                      <div className="my-4 border-t" />

                      <Button
                        variant="ghost"
                        onClick={logout}
                        className="w-full justify-start gap-3 h-12 text-base text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <LogOut className="h-5 w-5" />
                        Logout
                      </Button>
                    </nav>

                    {/* Footer */}
                    <div className="p-4 border-t bg-muted/30">
                      <p className="text-xs text-muted-foreground text-center">
                        ZeroRentals Property Search
                      </p>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              {/* Logo */}
              <div onClick={() => router.push('/')} className="flex items-center gap-2 cursor-pointer flex-shrink-0">
                <Image
                  src="/zerorentals-logo.png"
                  alt="ZeroRentals"
                  width={32}
                  height={32}
                  className="h-8 w-8 object-contain"
                />
                <span className="text-xl font-bold hidden sm:inline">ZeroRentals</span>
              </div>
              <Badge variant="outline" className="hidden md:flex">Tenant Dashboard</Badge>
            </div>

            {/* Right: Welcome + Desktop Buttons */}
            <div className="flex items-center gap-2 sm:gap-4">
              <span className="text-sm text-muted-foreground hidden lg:block">
                Welcome, {user?.name}
              </span>

              {/* Desktop Menu - Hidden on mobile */}
              <div className="hidden md:flex items-center gap-2">
                <Link href="/profile/tenant">
                  <Button variant="outline" size="sm" className="gap-2">
                    <User className="h-4 w-4" />
                    Profile
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={logout}
                  className="gap-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6 flex-1 overflow-x-hidden w-full max-w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="favorites">Favorites</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-8">
            {/* Recent Properties */}
            <RecentProperties properties={recentProperties} loading={loading} />

            {/* Tips Section */}
            <div className="mt-8 p-6 bg-primary/5 rounded-lg border border-primary/20">
              <h3 className="font-semibold mb-2">💡 Tips for finding your perfect home</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Use filters to narrow down your search</li>
                <li>• Save properties you like to compare them later</li>
                <li>• Contact owners early for popular listings</li>
                <li>• Visit properties in person before making a decision</li>
              </ul>
            </div>
          </TabsContent>

          {/* Favorites Tab */}
          <TabsContent value="favorites">
            <SavedPropertiesTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

// Protect this route with authentication
function TenantDashboardPage() {
  return (
    <ErrorBoundary>
      <TenantDashboard />
    </ErrorBoundary>
  )
}

export default withAuth(TenantDashboardPage, { requiredRole: 'tenant' })
