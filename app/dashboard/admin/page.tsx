"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Users, Home, LogOut, CheckCircle, Search, Download, Upload, FileSpreadsheet, Loader2, Plus, Menu, LayoutDashboard, CreditCard, Database } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth-context"
import { useRouter, useSearchParams } from "next/navigation"
import React, { useEffect, useState, useCallback, useRef, Suspense } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { getPendingProperties, getAllPayments, getTotalPropertyCount } from "@/lib/data-service"
import { handleDashboardError } from "@/lib/error-handler"
import { subscriptionManager } from "@/lib/supabase"
import type { Property, Payment } from "@/lib/types"
import { getAllUsers, type User as AdminUser } from "@/lib/user-service"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { useCsrf } from "@/lib/csrf-context"

// Import modular components
import { PendingPropertiesTab } from "@/components/dashboard/admin/PendingPropertiesTab"
import { UsersManagementTab } from "@/components/dashboard/admin/UsersManagementTab"
import { PaymentsTab } from "@/components/dashboard/admin/PaymentsTab"
import { AdminStats } from "@/components/dashboard/admin/AdminStats"
import { AllPropertiesTab } from "@/components/dashboard/admin/AllPropertiesTab"
// import { BulkUploadTab } from "@/components/dashboard/admin/BulkUploadTab" // COMMENTED OUT - Client doesn't want this feature now
import { withAuth } from "@/lib/with-auth"
import { ErrorBoundary } from "@/components/error-boundary"
import { useDebounce } from "@/hooks/use-debounce"

// ============================================================================
// LOADING SKELETONS
// ============================================================================
function HeaderSkeleton() {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-6 w-32 hidden sm:block" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-24 hidden sm:block" />
        <Skeleton className="h-9 w-9" />
      </div>
    </div>
  )
}

function TabSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}

// ============================================================================
// MOBILE NAVIGATION COMPONENT
// ============================================================================
function MobileNav({ userName, onLogout }: { userName: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const handleNavigate = (path: string) => {
    setOpen(false)
    router.push(path)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="md:hidden flex-shrink-0">
          <Menu className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] sm:w-[340px] p-0">
        <div className="flex flex-col h-full">
          {/* User Info Header */}
          <div className="p-6 border-b bg-muted/30">
            <p className="font-semibold text-lg">{userName}</p>
            <p className="text-sm text-muted-foreground mt-1">Administrator</p>
            <Badge variant="outline" className="mt-3">Admin Dashboard</Badge>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 p-4 space-y-3">
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-12 text-base"
              onClick={() => handleNavigate('/post-property')}
            >
              <Plus className="h-5 w-5" />
              Post Property
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-12 text-base"
              onClick={() => handleNavigate('/profile/admin')}
            >
              <Users className="h-5 w-5" />
              Profile
            </Button>

            <div className="my-4 border-t" />

            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-12 text-base text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => {
                setOpen(false)
                onLogout()
              }}
            >
              <LogOut className="h-5 w-5" />
              Logout
            </Button>
          </nav>

          {/* Footer */}
          <div className="p-4 border-t bg-muted/30">
            <p className="text-xs text-muted-foreground text-center">
              ZeroRentals Admin Portal
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function AdminDashboard() {
  const { user, logout } = useAuth()
  const { csrfToken } = useCsrf()
  const searchParams = useSearchParams()

  // Data states
  const [pendingProperties, setPendingProperties] = useState<Property[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [totalPropertiesCount, setTotalPropertiesCount] = useState(0)

  // Loading states
  const [loadingPending, setLoadingPending] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Centralized loading state for overview tab - tracks ALL data fetches
  const [overviewDataReady, setOverviewDataReady] = useState(false)

  // Refs to track if data has been loaded at least once
  const dataLoadedRef = useRef({
    users: false,
    payments: false,
    pending: false,
    totalStats: false
  })

  // Sync tab with URL for better UX and shareability
  const [activeTab, setActiveTab] = useState(() => {
    const tabFromUrl = searchParams.get('tab')
    const validTabs = ['pending', 'properties', 'overview', 'users', 'payments', 'data'] // 'bulk-upload' removed - client doesn't want this feature now
    return validTabs.includes(tabFromUrl || '') ? tabFromUrl! : 'pending'
  })
  const [searchQuery, setSearchQuery] = useState("")
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  // Ref to track if a tab data load is in progress (prevents race conditions)
  const loadingTabsRef = useRef<Set<string>>(new Set())

  // Refs to track in-flight requests for deduplication (synchronous check)
  const loadingUsersRef = useRef(false)
  const loadingPaymentsRef = useRef(false)
  const loadingPendingRef = useRef(false)

  // Ref to track overview data loading state synchronously (prevents race conditions)
  const overviewLoadingRef = useRef({
    users: false,
    payments: false
  })

  // Last updated timestamps for data freshness
  const [lastUpdated, setLastUpdated] = useState<{
    pending: Date | null
    users: Date | null
    payments: Date | null
    statsSnapshot: Date | null
  }>({
    pending: null,
    users: null,
    payments: null,
    statsSnapshot: null,
  })

  // Single timestamp for atomic stats fetching - ensures consistent data snapshot
  const statsTimestampRef = useRef<number>(0)

  // Mounted ref to prevent state updates on unmounted component
  const isMounted = useRef(true)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false
    }
  }, [])

  // Track when all overview data is ready (users, payments, pending, totalStats)
  // This prevents charts from rendering with incomplete data
  useEffect(() => {
    const allLoaded =
      dataLoadedRef.current.users &&
      dataLoadedRef.current.payments &&
      dataLoadedRef.current.pending &&
      dataLoadedRef.current.totalStats &&
      !loadingUsersRef.current &&
      !loadingPaymentsRef.current &&
      !loadingPendingRef.current

    if (allLoaded && !overviewDataReady) {
      setOverviewDataReady(true)
    } else if (!allLoaded && overviewDataReady) {
      setOverviewDataReady(false)
    }
  }, [users, payments, pendingProperties, totalPropertiesCount, overviewDataReady])

  useEffect(() => {
    // Initial load - sequential to avoid overwhelming the API
    const initDashboard = async () => {
      // CRITICAL: Only fetch data when user is confirmed loaded
      if (!user) {
        return
      }

      // Generate a single timestamp for atomic stats fetching
      // This ensures all stats queries use the same reference point
      const snapshotTimestamp = Date.now()
      statsTimestampRef.current = snapshotTimestamp

      try {
        // Load critical data first (pending properties) with consistent timestamp
        await loadPendingProperties(false, snapshotTimestamp)
        // Then load stats (less critical) with the same timestamp
        await loadTotalStats(snapshotTimestamp)

        // Load tab-specific data based on initial active tab from URL
        // This ensures data is loaded when user refreshes on a specific tab
        if (activeTab === 'users' && !loadingTabsRef.current.has('users')) {
          loadingTabsRef.current.add('users')
          await loadUsers(false, snapshotTimestamp)
          loadingTabsRef.current.delete('users')
        }
        if (activeTab === 'payments' && !loadingTabsRef.current.has('payments')) {
          loadingTabsRef.current.add('payments')
          await loadPayments(false, snapshotTimestamp)
          loadingTabsRef.current.delete('payments')
        }
        if (activeTab === 'overview') {
          // Load all data for overview tab
          if (!loadingTabsRef.current.has('users') && !overviewLoadingRef.current.users) {
            loadingTabsRef.current.add('users')
            overviewLoadingRef.current.users = true
            await loadUsers(false, snapshotTimestamp)
            loadingTabsRef.current.delete('users')
          }
          if (!loadingTabsRef.current.has('payments') && !overviewLoadingRef.current.payments) {
            loadingTabsRef.current.add('payments')
            overviewLoadingRef.current.payments = true
            await loadPayments(false, snapshotTimestamp)
            loadingTabsRef.current.delete('payments')
          }
        }
      } catch {
        // Error handled silently - toast shown by individual loaders
      }
    }

    initDashboard()

    // Setup real-time subscriptions for data sync using subscription manager
    // This prevents duplicate subscriptions when multiple components subscribe
    const cleanupFns: (() => void)[] = []

    if (user) {
      // Subscribe to properties table changes
      const cleanupProperties = subscriptionManager.subscribe(
        'admin-properties-changes',
        'properties',
        () => {
          // Refresh pending properties if a property was inserted/updated/deleted
          if (activeTab === 'pending') {
            loadPendingProperties(true)
          }
        },
        { event: '*', schema: 'public' }
      )
      cleanupFns.push(cleanupProperties)

      // Subscribe to users table changes
      const cleanupUsers = subscriptionManager.subscribe(
        'admin-users-changes',
        'users',
        () => {
          if (activeTab === 'users' || activeTab === 'overview') {
            loadUsers(true)
          }
        },
        { event: '*', schema: 'public' }
      )
      cleanupFns.push(cleanupUsers)

      // Subscribe to payments table changes
      const cleanupPayments = subscriptionManager.subscribe(
        'admin-payments-changes',
        'payments',
        () => {
          if (activeTab === 'payments' || activeTab === 'overview') {
            loadPayments(true)
          }
        },
        { event: '*', schema: 'public' }
      )
      cleanupFns.push(cleanupPayments)
    }

    return () => {
      // Cleanup all subscriptions on unmount
      cleanupFns.forEach(cleanup => cleanup())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeTab])

  const loadPendingProperties = async (force = false, snapshotTimestamp?: number) => {
    // Prevent duplicate concurrent requests using ref (synchronous check)
    if (loadingPendingRef.current) {
      return
    }

    // Skip if data is fresh (within 10 seconds) unless forced or using snapshot timestamp
    if (!force && !snapshotTimestamp && lastUpdated.pending) {
      const age = Date.now() - lastUpdated.pending.getTime()
      if (age < 10000) {
        return
      }
    }

    loadingPendingRef.current = true
    if (isMounted.current) setLoadingPending(true)

    try {
      const properties = await getPendingProperties()
      if (isMounted.current) {
        setPendingProperties(properties)
        // Use provided snapshot timestamp for consistent stats, or current time for individual refresh
        const timestamp = snapshotTimestamp ? new Date(snapshotTimestamp) : new Date()
        setLastUpdated(prev => ({ ...prev, pending: timestamp }))
        dataLoadedRef.current.pending = true
      }
    } catch (error) {
      if (isMounted.current) {
        handleDashboardError(error, "Failed to load pending properties")
      }
    } finally {
      loadingPendingRef.current = false
      if (isMounted.current) setLoadingPending(false)
    }
  }

  const loadTotalStats = async (snapshotTimestamp?: number) => {
    try {
      const count = await getTotalPropertyCount()
      if (isMounted.current) {
        setTotalPropertiesCount(count)
        // Use provided snapshot timestamp for consistent stats
        const timestamp = snapshotTimestamp ? new Date(snapshotTimestamp) : new Date()
        setLastUpdated(prev => ({ ...prev, statsSnapshot: timestamp }))
        dataLoadedRef.current.totalStats = true
      }
    } catch (error) {
      // Error loading stats - check for auth errors, otherwise silently fail
      handleDashboardError(error)
      dataLoadedRef.current.totalStats = true // Mark as loaded even on error to prevent infinite loading
    }
  }

  // Optimistic UI update - immediately remove property from pending list
  const handleOptimisticRemove = (propertyId: string) => {

    setPendingProperties(prev => prev.filter(p => p.id !== propertyId))
  }

  const loadUsers = async (force = false, snapshotTimestamp?: number) => {
    // Prevent duplicate concurrent requests using ref (synchronous check)
    if (loadingUsersRef.current) {
      return
    }

    // Skip if data is fresh (within 10 seconds) unless forced or using snapshot timestamp
    if (!force && !snapshotTimestamp && lastUpdated.users) {
      const age = Date.now() - lastUpdated.users.getTime()
      if (age < 10000) {
        return
      }
    }

    loadingUsersRef.current = true
    setLoadingUsers(true)
    const timeoutId = setTimeout(() => {
      if (!isMounted.current) return
      setLoadingUsers((current) => {
        if (current) {
          toast.error("Loading users timed out. Please refresh.")
          return false
        }
        return current
      })
    }, 15000)

    try {
      const data = await getAllUsers()
      if (isMounted.current) {
        setUsers(data)
        // Use provided snapshot timestamp for consistent stats, or current time for individual refresh
        const timestamp = snapshotTimestamp ? new Date(snapshotTimestamp) : new Date()
        setLastUpdated(prev => ({ ...prev, users: timestamp }))
        dataLoadedRef.current.users = true
      }
    } catch (error) {
      if (isMounted.current) {
        handleDashboardError(error, "Failed to load users")
      }
      dataLoadedRef.current.users = true // Mark as loaded even on error
    } finally {
      clearTimeout(timeoutId)
      loadingUsersRef.current = false
      overviewLoadingRef.current.users = false
      if (isMounted.current) setLoadingUsers(false)
    }
  }

  const loadPayments = async (force = false, snapshotTimestamp?: number) => {
    // Prevent duplicate concurrent requests using ref (synchronous check)
    if (loadingPaymentsRef.current) {
      return
    }

    // Skip if data is fresh (within 10 seconds) unless forced or using snapshot timestamp
    if (!force && !snapshotTimestamp && lastUpdated.payments) {
      const age = Date.now() - lastUpdated.payments.getTime()
      if (age < 10000) {
        return
      }
    }

    loadingPaymentsRef.current = true
    setLoadingPayments(true)
    const timeoutId = setTimeout(() => {
      if (!isMounted.current) return
      setLoadingPayments((current) => {
        if (current) {
          toast.error("Loading payments timed out. Please refresh.")
          return false
        }
        return current
      })
    }, 15000)

    try {
      const data = await getAllPayments()
      if (isMounted.current) {
        setPayments(data)
        // Use provided snapshot timestamp for consistent stats, or current time for individual refresh
        const timestamp = snapshotTimestamp ? new Date(snapshotTimestamp) : new Date()
        setLastUpdated(prev => ({ ...prev, payments: timestamp }))
        dataLoadedRef.current.payments = true
      }
    } catch (error) {
      if (isMounted.current) {
        handleDashboardError(error, "Failed to load payments")
      }
      dataLoadedRef.current.payments = true // Mark as loaded even on error
    } finally {
      clearTimeout(timeoutId)
      loadingPaymentsRef.current = false
      overviewLoadingRef.current.payments = false
      if (isMounted.current) setLoadingPayments(false)
      loadingTabsRef.current.delete('payments')
    }
  }

  const handleTabChange = (value: string) => {
    const previousTab = activeTab
    setActiveTab(value)

    // Force refresh when switching tabs to ensure fresh data
    const forceRefresh = previousTab !== value

    // Lazy load data only when tab is clicked
    // Use ref to prevent race conditions from rapid tab clicks
    if (value === 'users' && !loadingUsers && !loadingTabsRef.current.has('users')) {
      loadingTabsRef.current.add('users')
      loadUsers(forceRefresh).finally(() => loadingTabsRef.current.delete('users'))
    }
    if (value === 'payments' && !loadingPayments && !loadingTabsRef.current.has('payments')) {
      loadingTabsRef.current.add('payments')
      loadPayments(forceRefresh).finally(() => loadingTabsRef.current.delete('payments'))
    }
    if (value === 'overview') {
      // Generate a single timestamp for atomic stats fetching on overview tab
      // This ensures all stats queries use the same reference point for consistent data
      const snapshotTimestamp = Date.now()
      statsTimestampRef.current = snapshotTimestamp

      // Load all data for stats if not already loaded
      // Use overviewLoadingRef to prevent duplicate requests during rapid tab switches
      if (!loadingTabsRef.current.has('users') && !overviewLoadingRef.current.users) {
        loadingTabsRef.current.add('users')
        overviewLoadingRef.current.users = true
        loadUsers(forceRefresh, snapshotTimestamp).finally(() => loadingTabsRef.current.delete('users'))
      }
      if (!loadingTabsRef.current.has('payments') && !overviewLoadingRef.current.payments) {
        loadingTabsRef.current.add('payments')
        overviewLoadingRef.current.payments = true
        loadPayments(forceRefresh, snapshotTimestamp).finally(() => loadingTabsRef.current.delete('payments'))
      }
    }
    if (value === 'pending') {
      // Refresh pending properties when switching to pending tab
      if (!loadingTabsRef.current.has('pending')) {
        loadingTabsRef.current.add('pending')
        loadPendingProperties(forceRefresh).finally(() => loadingTabsRef.current.delete('pending'))
      }
    }
  }

  const handleExportUsers = async (role?: string) => {
    // Check for CSRF token before making request
    if (!csrfToken) {
      toast.error('Security token not available. Please refresh the page.')
      return
    }

    setExporting(true)
    try {
      const response = await fetch('/api/admin/export-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          role: role || 'all',
          format: 'csv',
          fromDate: fromDate || undefined,
          toDate: toDate || undefined
        })
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Export failed' }))
        throw new Error(error.error || 'Failed to export users')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `users${role ? `-${role}` : ''}-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Users exported successfully')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to export users')
    } finally {
      setExporting(false)
    }
  }

  const handleExportProperties = async () => {
    // Check for CSRF token before making request
    if (!csrfToken) {
      toast.error('Security token not available. Please refresh the page.')
      return
    }

    setExporting(true)
    try {
      const response = await fetch('/api/admin/export-properties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          format: 'csv',
          fromDate: fromDate || undefined,
          toDate: toDate || undefined
        })
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Export failed' }))
        throw new Error(error.error || 'Failed to export properties')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `properties-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Properties exported successfully')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to export properties')
    } finally {
      setExporting(false)
    }
  }

  const handleImportProperties = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Check for CSRF token before making request
    if (!csrfToken) {
      toast.error('Security token not available. Please refresh the page.')
      return
    }

    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const validTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    if (!validTypes.includes(file.type) && !file.name.match(/\.(csv|xlsx|xls)$/i)) {
      toast.error('Please upload a CSV or Excel file')
      e.target.value = ''
      return
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      toast.error('File size must be less than 10MB')
      e.target.value = ''
      return
    }

    setImporting(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/admin/import-properties', {
        method: 'POST',
        headers: {
          'x-csrf-token': csrfToken,
        },
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) throw new Error(result.error || 'Import failed')

      toast.success(result.message)
      // Import errors are shown in the result message
    } catch (error: any) {
      // Import error handled below
      const errorMessage = error.message || 'Failed to import properties'

      // Provide specific error messages
      if (errorMessage.includes('Unauthorized')) {
        toast.error('Session expired. Please refresh the page and try again.')
      } else if (errorMessage.includes('file type')) {
        toast.error('Invalid file type. Please upload an Excel (.xlsx, .xls) or CSV file.')
      } else if (errorMessage.includes('size')) {
        toast.error('File is too large. Maximum size is 10MB.')
      } else {
        toast.error(errorMessage)
      }
    } finally {
      setImporting(false)
      e.target.value = '' // Reset file input
    }
  }


  // Calculate stats with memoization - only count completed/successful payments
  const totalRevenue = React.useMemo(() =>
    payments.reduce((sum, p) => {
      if (p.status === 'success' || p.status === 'completed') {
        return sum + p.amount
      }
      return sum
    }, 0),
    [payments]
  )

  const router = useRouter()

  // Update URL when tab changes
  const handleTabChangeWithUrl = useCallback((value: string) => {
    handleTabChange(value)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.push(`?${params.toString()}`, { scroll: false })
  }, [handleTabChange, router, searchParams])

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/50">
        <HeaderSkeleton />
        <div className="container mx-auto px-4 py-8">
          <TabSkeleton />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/50 overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background border-b">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Mobile Navigation - Left side */}
              <MobileNav userName={user?.name || 'Admin'} onLogout={logout} />
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
              <Badge variant="outline" className="bg-primary/10 hidden md:flex">Admin Dashboard</Badge>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <span className="text-sm text-muted-foreground hidden lg:block">
                Welcome, {user?.name}
              </span>
              <Link href="/post-property" className="hidden sm:block">
                <Button size="sm" className="gap-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Post Property</span>
                </Button>
              </Link>
              <Link href="/profile/admin" className="hidden md:block">
                <Button variant="outline" size="sm" className="gap-2">
                  <Users className="h-4 w-4" />
                  <span className="hidden sm:inline">Profile</span>
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="hidden md:flex gap-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white hover:text-white"
              >
                <LogOut className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 flex-1 overflow-x-hidden w-full max-w-full">
        <div className="mb-8">
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">Manage properties, users, and platform settings</p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChangeWithUrl} className="space-y-4 md:space-y-6">
          <div className="bg-white border-b sticky top-[57px] md:top-[73px] z-10">
            <TabsList className="w-full justify-start overflow-x-auto flex-nowrap h-auto p-1">
              <TabsTrigger value="pending" className="text-xs md:text-sm whitespace-nowrap">
                <span className="hidden sm:inline">Pending Approvals</span>
                <span className="sm:hidden">Pending</span>
                {pendingProperties.length > 0 && (
                  <Badge variant="destructive" className="ml-1 md:ml-2 text-xs">
                    {pendingProperties.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="properties" className="text-xs md:text-sm whitespace-nowrap">
                <span className="hidden sm:inline">All Properties</span>
                <span className="sm:hidden">Properties</span>
              </TabsTrigger>
              <TabsTrigger value="overview" className="text-xs md:text-sm whitespace-nowrap">Overview</TabsTrigger>
              <TabsTrigger value="users" className="text-xs md:text-sm whitespace-nowrap">Users</TabsTrigger>
              <TabsTrigger value="payments" className="text-xs md:text-sm whitespace-nowrap">Payments</TabsTrigger>
              {/* BULK UPLOAD TAB COMMENTED OUT - Client doesn't want this feature now, can be enabled later
              <TabsTrigger value="bulk-upload" className="text-xs md:text-sm whitespace-nowrap">
                <span className="hidden sm:inline">Bulk Upload</span>
                <span className="sm:hidden">Upload</span>
              </TabsTrigger>
              */}
              <TabsTrigger value="data" className="text-xs md:text-sm whitespace-nowrap">
                <span className="hidden sm:inline">Data Management</span>
                <span className="sm:hidden">Data</span>
              </TabsTrigger>
            </TabsList>

            {/* Search Bar - Only show on tabs that use it */}
            {(activeTab === 'pending' || activeTab === 'users') && (
              <div className="px-4 md:px-6 py-3 md:py-4 border-t md:border-t-0">
                <div className="relative w-full md:max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={activeTab === 'pending' ? "Search pending properties..." : "Search users..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 text-sm md:text-base"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Pending Approvals Tab */}
          <TabsContent value="pending">
            <PendingPropertiesTab
              properties={pendingProperties}
              loading={loadingPending}
              onRefresh={loadPendingProperties}
              searchQuery={debouncedSearchQuery}
              onOptimisticRemove={handleOptimisticRemove}
            />
          </TabsContent>

          {/* All Properties Tab */}
          <TabsContent value="properties">
            <AllPropertiesTab />
          </TabsContent>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="space-y-6">
              {!overviewDataReady ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-32" />
                  ))}
                </div>
              ) : (
                <AdminStats
                  totalUsers={users.length}
                  totalProperties={totalPropertiesCount}
                  totalRevenue={totalRevenue}
                  pendingApprovals={pendingProperties.length}
                />
              )}

              {/* Platform Overview Details */}
              <Card>
                <CardHeader>
                  <CardTitle>Platform User Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Owners</p>
                        <p className="text-sm text-muted-foreground">Property owners registered</p>
                      </div>
                      <Badge variant="outline" className="text-lg px-4 py-2">
                        {!overviewDataReady ? (
                          <Skeleton className="h-6 w-12" />
                        ) : (
                          users.filter(u => u.role === 'owner').length
                        )}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Tenants</p>
                        <p className="text-sm text-muted-foreground">Users looking for properties</p>
                      </div>
                      <Badge variant="outline" className="text-lg px-4 py-2">
                        {!overviewDataReady ? (
                          <Skeleton className="h-6 w-12" />
                        ) : (
                          users.filter(u => u.role === 'tenant').length
                        )}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <UsersManagementTab
              users={users}
              loading={loadingUsers}
              onRefresh={loadUsers}
              searchQuery={debouncedSearchQuery}
              currentAdminId={user?.id}
            />
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments">
            <PaymentsTab
              payments={payments}
              loading={loadingPayments}
              onRefresh={() => loadPayments(true)}
              lastUpdated={lastUpdated.payments}
            />
          </TabsContent>

          {/* BULK UPLOAD TAB COMMENTED OUT - Client doesn't want this feature now, can be enabled later
          <TabsContent value="bulk-upload">
            <BulkUploadTab />
          </TabsContent>
          */}

          {/* Data Management Tab */}
          <TabsContent value="data">
            <div className="grid gap-6">
              {/* Export Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="h-5 w-5" />
                    Export Data
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Date Range Filter */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">From Date</label>
                      <Input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">To Date</label>
                      <Input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* User Export Buttons */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Button
                      onClick={() => handleExportUsers('all')}
                      disabled={exporting}
                      variant="outline"
                      className="w-full"
                    >
                      {exporting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Export All Users
                    </Button>
                    <Button
                      onClick={() => handleExportUsers('owner')}
                      disabled={exporting}
                      variant="outline"
                      className="w-full"
                    >
                      {exporting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Export Owners
                    </Button>
                    <Button
                      onClick={() => handleExportUsers('tenant')}
                      disabled={exporting}
                      variant="outline"
                      className="w-full"
                    >
                      {exporting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Export Tenants
                    </Button>
                    <Button
                      onClick={handleExportProperties}
                      disabled={exporting}
                      variant="outline"
                      className="w-full"
                    >
                      {exporting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Export Properties
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Download data as CSV files for backup or analysis. Use date filters to export specific time ranges.
                  </p>
                </CardContent>
              </Card>

              {/* Import Section - moved to Bulk Upload tab */}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

// Protect this route with authentication and wrap with error boundary
const ProtectedAdminDashboard = withAuth(AdminDashboard, { requiredRole: 'admin' })

// Wrapper with Suspense for searchParams
function AdminDashboardWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col bg-muted/50">
        <HeaderSkeleton />
        <div className="container mx-auto px-4 py-8">
          <TabSkeleton />
        </div>
      </div>
    }>
      <ProtectedAdminDashboard />
    </Suspense>
  )
}

export default function AdminDashboardPage() {
  return (
    <ErrorBoundary>
      <AdminDashboardWrapper />
    </ErrorBoundary>
  )
}
