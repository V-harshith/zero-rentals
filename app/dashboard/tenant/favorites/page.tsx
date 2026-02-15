"use client"

import { useEffect, useState, useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { useFavorites } from "@/lib/favorites-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PropertyCard } from "@/components/property-card"
import { Heart, ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import type { Property } from "@/lib/types"
import { withAuth } from "@/lib/with-auth"

interface Favorite {
  id: string
  user_id: string
  property_id: string
  created_at: string
  properties: Property | null
}

function FavoritesPage() {
  const { user, loading: authLoading } = useAuth()
  const { favoriteIds, isLoading: favoritesLoading, refreshFavorites } = useFavorites()
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchFavorites = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/favorites")
      if (response.ok) {
        const { data } = await response.json()
        setFavorites(data || [])
      } else {
        const error = await response.json().catch(() => ({ error: 'Failed to load favorites' }))
        toast.error(error.error || 'Failed to load favorites')
      }
    } catch (error) {
      console.error("Error fetching favorites:", error)
      toast.error('Unable to connect to server')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch favorites when user is available and when favoriteIds change
  useEffect(() => {
    // Wait for auth to finish loading and user to be available
    if (authLoading || !user) return

    fetchFavorites()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, favoriteIds])

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" asChild className="mb-4">
            <Link href="/dashboard/tenant">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Heart className="h-8 w-8 text-red-500 fill-red-500" />
            My Favorites
          </h1>
          <p className="text-muted-foreground mt-2">
            {favorites.length} saved {favorites.length === 1 ? "property" : "properties"}
          </p>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="mt-4 text-muted-foreground">Loading favorites...</p>
          </div>
        ) : favorites.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Heart className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No favorites yet</h3>
              <p className="text-muted-foreground mb-4">
                Start saving properties you like to view them here
              </p>
              <Button asChild>
                <Link href="/search">Browse Properties</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {favorites.map((favorite) => (
              favorite.properties ? (
                <PropertyCard
                  key={favorite.id}
                  property={favorite.properties}
                />
              ) : null
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default withAuth(FavoritesPage, { requiredRole: 'tenant' })

