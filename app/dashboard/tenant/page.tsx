"use client"

import React, { useEffect, useState, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import { LogOut, Loader2, User, Menu, Edit, ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
        <div className="container mx-auto px-3 sm:px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2 sm:gap-4">
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
            <div className="flex items-center gap-2 sm:gap-4">
              <span className="text-sm text-muted-foreground hidden lg:block">
                Welcome, {user?.name}
              </span>

              {/* User Actions Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <User className="h-4 w-4" />
                    <span className="hidden sm:inline">Menu</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span className="font-medium">{user?.name}</span>
                      <span className="text-xs text-muted-foreground">{user?.email}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile/tenant" className="cursor-pointer flex items-center gap-2">
                      <Edit className="h-4 w-4" />
                      Edit Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={logout}
                    className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 flex items-center gap-2"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 flex-1">
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
