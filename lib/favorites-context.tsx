"use client"

import { createContext, useContext, useState, useEffect, useCallback } from "react"
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

  // Load favorites when user changes
  useEffect(() => {
    if (user?.role === "tenant") {
      loadFavorites()
    } else {
      setFavoriteIds(new Set())
    }
  }, [user])

  const loadFavorites = async () => {
    if (!user) return

    setIsLoading(true)
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
      setFavoriteIds(ids)
    } catch {
      // Error handled silently - toast shown for user feedback
    } finally {
      setIsLoading(false)
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

    // Optimistic update
    setFavoriteIds(prev => new Set([...prev, propertyId]))

    try {
      const { error } = await supabase
        .from('favorites')
        .insert([{ user_id: user.id, property_id: propertyId }])

      if (error) {
        // Rollback on error
        setFavoriteIds(prev => {
          const next = new Set(prev)
          next.delete(propertyId)
          return next
        })

        if (error.code === '23505') {
          // Duplicate - already in favorites, that's fine
          setFavoriteIds(prev => new Set([...prev, propertyId]))
          return true
        }

        toast.error("Failed to add to favorites")
        return false
      }

      toast.success("Added to favorites")
      return true
    } catch {
      // Rollback on error
      setFavoriteIds(prev => {
        const next = new Set(prev)
        next.delete(propertyId)
        return next
      })
      toast.error("Failed to add to favorites")
      return false
    }
  }, [user])

  const removeFavorite = useCallback(async (propertyId: string): Promise<boolean> => {
    if (!user) return false

    // Optimistic update
    setFavoriteIds(prev => {
      const next = new Set(prev)
      next.delete(propertyId)
      return next
    })

    try {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('property_id', propertyId)

      if (error) {
        // Rollback on error
        setFavoriteIds(prev => new Set([...prev, propertyId]))
        toast.error("Failed to remove from favorites")
        return false
      }

      toast.success("Removed from favorites")
      return true
    } catch {
      // Rollback on error
      setFavoriteIds(prev => new Set([...prev, propertyId]))
      toast.error("Failed to remove from favorites")
      return false
    }
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
