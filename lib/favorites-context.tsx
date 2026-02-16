"use client"

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "./auth-context"
import { toast } from "sonner"
import { supabase } from "./supabase"

interface FavoritesContextType {
  favoriteIds: Set<string>
  count: number
  isLoading: boolean
  isFavorite: (id: string) => boolean
  addFavorite: (id: string) => Promise<boolean>
  removeFavorite: (id: string) => Promise<boolean>
  refreshFavorites: () => Promise<void>
}

const FavoritesContext = createContext<FavoritesContextType | null>(null)

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const isMounted = useRef(true)

  // Track in-flight requests to prevent race conditions
  const inFlightRequests = useRef<Map<string, Promise<boolean>>>(new Map())

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false
      inFlightRequests.current.clear()
    }
  }, [])

  // Load favorites when user changes
  useEffect(() => {
    if (user?.role === "tenant") {
      loadFavorites()
    } else {
      if (isMounted.current) setFavoriteIds(new Set())
    }
  }, [user])

  const loadFavorites = async () => {
    if (!user) return

    if (isMounted.current) setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('favorites')
        .select('property_id')
        .eq('user_id', user.id)

      if (error) {
        // Error handled silently - toast shown for user feedback
        return
      }

      const ids = new Set(data.map(f => f.property_id))
      if (isMounted.current) setFavoriteIds(ids)
    } catch {
      // Error handled silently - toast shown for user feedback
    } finally {
      if (isMounted.current) setIsLoading(false)
    }
  }

  const addFavorite = useCallback(async (propertyId: string): Promise<boolean> => {
    if (!user) {
      toast.error("Please login to save favorites")
      return false
    }

    if (user.role !== 'tenant') {
      toast.error("Only tenants can save favorites")
      return false
    }

    // Check if there's already an in-flight request for this property
    const existingRequest = inFlightRequests.current.get(`add-${propertyId}`)
    if (existingRequest) {
      return existingRequest
    }

    // Optimistic update
    setFavoriteIds(prev => new Set([...prev, propertyId]))

    // Create the request and track it
    const request = (async () => {
      try {
        const { error } = await supabase
          .from('favorites')
          .insert([{ user_id: user.id, property_id: propertyId }])

        if (error) {
          // Rollback on error
          if (isMounted.current) {
            setFavoriteIds(prev => {
              const next = new Set(prev)
              next.delete(propertyId)
              return next
            })
          }

          if (error.code === '23505') {
            // Duplicate - already in favorites, that's fine
            if (isMounted.current) {
              setFavoriteIds(prev => new Set([...prev, propertyId]))
            }
            return true
          }

          toast.error("Failed to add to favorites")
          return false
        }

        toast.success("Added to favorites")
        return true
      } catch {
        // Rollback on error
        if (isMounted.current) {
          setFavoriteIds(prev => {
            const next = new Set(prev)
            next.delete(propertyId)
            return next
          })
        }
        toast.error("Failed to add to favorites")
        return false
      } finally {
        // Clean up in-flight tracking
        inFlightRequests.current.delete(`add-${propertyId}`)
      }
    })()

    inFlightRequests.current.set(`add-${propertyId}`, request)
    return request
  }, [user])

  const removeFavorite = useCallback(async (propertyId: string): Promise<boolean> => {
    if (!user) return false

    // Check if there's already an in-flight request for this property
    const existingRequest = inFlightRequests.current.get(`remove-${propertyId}`)
    if (existingRequest) {
      return existingRequest
    }

    // Optimistic update
    setFavoriteIds(prev => {
      const next = new Set(prev)
      next.delete(propertyId)
      return next
    })

    // Create the request and track it
    const request = (async () => {
      try {
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('property_id', propertyId)

        if (error) {
          // Rollback on error
          if (isMounted.current) {
            setFavoriteIds(prev => new Set([...prev, propertyId]))
          }
          toast.error("Failed to remove from favorites")
          return false
        }

        toast.success("Removed from favorites")
        return true
      } catch {
        // Rollback on error
        if (isMounted.current) {
          setFavoriteIds(prev => new Set([...prev, propertyId]))
        }
        toast.error("Failed to remove from favorites")
        return false
      } finally {
        // Clean up in-flight tracking
        inFlightRequests.current.delete(`remove-${propertyId}`)
      }
    })()

    inFlightRequests.current.set(`remove-${propertyId}`, request)
    return request
  }, [user])

  // Direct check without useCallback to avoid stale closure issues
  const isFavorite = (id: string) => favoriteIds.has(id)

  const refreshFavorites = useCallback(async () => {
    await loadFavorites()
  }, [user])

  return (
    <FavoritesContext.Provider
      value={{
        favoriteIds,
        count: favoriteIds.size,
        isLoading,
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
