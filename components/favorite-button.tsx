"use client"

import { Button } from "@/components/ui/button"
import { useFavorites } from "@/lib/favorites-context"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"
import { Heart } from "lucide-react"
import { useRouter } from "next/navigation"

interface FavoriteButtonProps {
  propertyId: string
  variant?: "default" | "outline" | "ghost"
  size?: "default" | "sm" | "lg" | "icon"
}

export function FavoriteButton({ propertyId, variant = "ghost", size = "icon" }: FavoriteButtonProps) {
  const { user } = useAuth()
  const router = useRouter()
  const { isFavorite, addFavorite, removeFavorite, isSyncing } = useFavorites()
  
  const favorite = isFavorite(propertyId)

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault() // Prevent navigation if button is in a link
    e.stopPropagation() // Prevent event bubbling
    
    if (!user) {
      toast.error("Please login to save favorites")
      router.push("/login/tenant")
      return
    }

    if (favorite) {
      removeFavorite(propertyId)
      toast.success("Removed from favorites")
    } else {
      addFavorite(propertyId)
      toast.success("Added to favorites")
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleToggle}
      disabled={isSyncing}
      className="transition-all hover:scale-110"
      aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
    >
      <Heart
        className={`h-4 w-4 transition-all ${
          favorite ? "fill-red-500 text-red-500" : "hover:text-red-500"
        }`}
      />
    </Button>
  )
}
