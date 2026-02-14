"use client"

import { useState, useEffect } from "react"
import { X, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"

export function LocationNotification() {
  const [isOpen, setIsOpen] = useState(true)
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const hasSeenNotification = localStorage.getItem("locationNotificationSeen")
    if (hasSeenNotification) {
      setIsVisible(false)
    }
  }, [])

  const handleRequestLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log("[v0] Location granted:", position.coords)
          setIsOpen(false)
          localStorage.setItem("locationNotificationSeen", "true")
          localStorage.setItem("userLocation", JSON.stringify(position.coords))
        },
        (error) => {
          console.log("[v0] Location denied:", error)
          setIsOpen(false)
          localStorage.setItem("locationNotificationSeen", "true")
        },
      )
    }
  }

  const handleDismiss = () => {
    setIsOpen(false)
    localStorage.setItem("locationNotificationSeen", "true")
  }

  if (!isVisible || !isOpen) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slideUp">
      <div className="bg-white rounded-xl shadow-2xl border border-primary/20 p-4 md:p-6 max-w-sm hover:shadow-2xl transition-shadow duration-300">
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-primary/10">
              <MapPin className="h-6 w-6 text-primary" />
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">Access Your Location</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Help us show PGs and rentals near you for a better experience
            </p>
            <div className="mt-4 flex gap-3">
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90 text-white transition-colors duration-300"
                onClick={handleRequestLocation}
              >
                Allow Location
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="transition-colors duration-300 bg-transparent"
                onClick={handleDismiss}
              >
                Later
              </Button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors duration-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
