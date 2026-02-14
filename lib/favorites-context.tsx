"use client"

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "./auth-context"
import { toast } from "sonner"

interface PendingAction {
  type: "add" | "remove"
  propertyId: string
  timestamp: number
  retries: number
}

interface FavoriteRecord {
  id: string
  property_id: string
}

interface FavoritesContextType {
  favoriteIds: Set<string>
  favoriteRecords: Map<string, string> // property_id -> favorite_id
  count: number
  isLoading: boolean
  isSyncing: boolean
  isFavorite: (id: string) => boolean
  addFavorite: (id: string) => void
  removeFavorite: (id: string) => void
  refreshFavorites: () => Promise<void>
}

const FavoritesContext = createContext<FavoritesContextType | null>(null)

const CACHE_KEY = "favorites_cache"
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
const SYNC_DEBOUNCE = 2000 // 2 seconds
const MAX_RETRIES = 3

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [favoriteRecords, setFavoriteRecords] = useState<Map<string, string>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncQueue, setSyncQueue] = useState<PendingAction[]>([])
  const syncTimerRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const hasFetchedRef = useRef(false)

  // Load from cache on mount
  useEffect(() => {
    const cached = loadFromCache()
    if (cached && cached.userId === user?.id) {
      setFavoriteIds(new Set(cached.ids))
      setFavoriteRecords(new Map(cached.records || []))
    }
  }, [])

  // Fetch favorites when user logs in
  useEffect(() => {
    if (user?.role === "tenant" && !hasFetchedRef.current) {
      hasFetchedRef.current = true
      loadFavorites()
    } else if (!user) {
      // Clear on logout
      hasFetchedRef.current = false
      setFavoriteIds(new Set())
      setFavoriteRecords(new Map())
      clearCache()
    }
  }, [user])

  // Background sync processor
  useEffect(() => {
    if (syncQueue.length > 0 && !isSyncing) {
      // Clear existing timer
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current)
      }
      
      // Debounce sync
      syncTimerRef.current = setTimeout(() => {
        processSyncQueue()
      }, SYNC_DEBOUNCE)
    }

    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current)
      }
    }
  }, [syncQueue, isSyncing])

  const loadFromCache = () => {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (!cached) return null

      const data = JSON.parse(cached)
      const age = Date.now() - data.timestamp

      if (age > CACHE_DURATION) {
        localStorage.removeItem(CACHE_KEY)
        return null
      }

      return data
    } catch {
      return null
    }
  }

  const saveToCache = (ids: string[], records?: Map<string, string>) => {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          ids,
          records: records ? Array.from(records.entries()) : [],
          userId: user?.id,
          timestamp: Date.now(),
        })
      )
    } catch {
      // Ignore cache save errors
    }
  }

  const clearCache = () => {
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch {
      // Ignore cache clear errors
    }
  }

  const loadFavorites = async () => {
    if (!user) return

    setIsLoading(true)
    try {
      const response = await fetch("/api/favorites")
      if (!response.ok) throw new Error("Failed to fetch favorites")

      const { data } = await response.json()
      const ids = data.map((f: { property_id: string }) => f.property_id)
      const records = new Map<string, string>(
        data.map((f: { id: string; property_id: string }) => [f.property_id, f.id])
      )

      setFavoriteIds(new Set(ids))
      setFavoriteRecords(records)
      saveToCache(ids, records)
    } catch {
      // Don't show error toast on initial load, use cache if available
    } finally {
      setIsLoading(false)
    }
  }

  const addFavorite = useCallback((id: string) => {
    // Optimistic update
    setFavoriteIds((prev) => new Set([...prev, id]))

    // Queue for sync
    setSyncQueue((prev) => [
      ...prev,
      { type: "add", propertyId: id, timestamp: Date.now(), retries: 0 },
    ])
  }, [])

  const removeFavorite = useCallback((id: string) => {
    // Optimistic update
    setFavoriteIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })

    // Queue for sync
    setSyncQueue((prev) => [
      ...prev,
      { type: "remove", propertyId: id, timestamp: Date.now(), retries: 0 },
    ])
  }, [])

  const processSyncQueue = async () => {
    if (syncQueue.length === 0 || isSyncing || !user) return

    setIsSyncing(true)
    const queue = [...syncQueue]
    const failedActions: PendingAction[] = []

    for (const action of queue) {
      try {
        if (action.type === "add") {
          const response = await fetch("/api/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ property_id: action.propertyId }),
          })

          if (!response.ok) throw new Error("Failed to add favorite")

          // Store the returned favorite ID to avoid N+1 queries on future removals
          const { data: favoriteRecord } = await response.json()
          if (favoriteRecord?.id) {
            setFavoriteRecords(prev => {
              const next = new Map(prev)
              next.set(action.propertyId, favoriteRecord.id)
              return next
            })
          }
        } else {
          // Use stored favorite ID to avoid N+1 query
          const favoriteId = favoriteRecords.get(action.propertyId)

          if (favoriteId) {
            const deleteResponse = await fetch(`/api/favorites/${favoriteId}`, {
              method: "DELETE",
            })
            if (!deleteResponse.ok) throw new Error("Failed to remove favorite")
            // Remove from records map after successful deletion
            setFavoriteRecords(prev => {
              const next = new Map(prev)
              next.delete(action.propertyId)
              return next
            })
          }
        }

        // Success - remove from queue
        setSyncQueue((prev) => prev.filter((a) => a !== action))
      } catch {
        // Retry logic

        // Retry logic
        if (action.retries < MAX_RETRIES) {
          failedActions.push({ ...action, retries: action.retries + 1 })
        } else {
          // Max retries exceeded - rollback optimistic update
          if (action.type === "add") {
            setFavoriteIds((prev) => {
              const next = new Set(prev)
              next.delete(action.propertyId)
              return next
            })
            toast.error("Failed to add to favorites. Please try again.")
          } else {
            setFavoriteIds((prev) => new Set([...prev, action.propertyId]))
            toast.error("Failed to remove from favorites. Please try again.")
          }
          
          // Remove from queue
          setSyncQueue((prev) => prev.filter((a) => a !== action))
        }
      }
    }

    // Re-add failed actions for retry
    if (failedActions.length > 0) {
      setSyncQueue((prev) => [...prev.filter((a) => !queue.includes(a)), ...failedActions])
    }

    // Update cache with current state
    saveToCache(Array.from(favoriteIds), favoriteRecords)

    setIsSyncing(false)
  }

  const isFavorite = useCallback(
    (id: string) => favoriteIds.has(id),
    [favoriteIds]
  )

  const refreshFavorites = useCallback(async () => {
    await loadFavorites()
  }, [user])

  return (
    <FavoritesContext.Provider
      value={{
        favoriteIds,
        favoriteRecords,
        count: favoriteIds.size,
        isLoading,
        isSyncing,
        isFavorite,
        addFavorite,
        removeFavorite,
        refreshFavorites,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  )
}

export const useFavorites = () => {
  const context = useContext(FavoritesContext)
  if (!context) {
    throw new Error("useFavorites must be used within FavoritesProvider")
  }
  return context
}
