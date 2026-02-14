"use client"

import { useEffect, useRef, useState } from "react"
import { useGoogleMaps } from "@/lib/google-maps-loader"
import { Loader2 } from "lucide-react"

interface PropertyMapProps {
  properties: Array<{
    id: string
    title: string
    latitude: number
    longitude: number
    private_room_price?: number
    double_sharing_price?: number
    images?: string[]
  }>
  center?: { lat: number; lng: number }
  zoom?: number
  onMarkerClick?: (propertyId: string) => void
}

export function PropertyMap({
  properties,
  center,
  zoom = 12,
  onMarkerClick,
}: PropertyMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const [markers, setMarkers] = useState<google.maps.Marker[]>([])

  const { isLoaded, loadError } = useGoogleMaps()

  useEffect(() => {
    if (!isLoaded || !mapRef.current) return

    const defaultCenter = center || { lat: 12.9716, lng: 77.5946 } // Bangalore

    const mapInstance = new google.maps.Map(mapRef.current, {
      center: defaultCenter,
      zoom,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
    })

    setMap(mapInstance)
  }, [isLoaded, center, zoom])

  if (loadError) {
    return (
      <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-muted rounded-lg border">
        <div className="text-center p-4">
          <p className="text-destructive font-medium mb-1">Failed to load map</p>
          <p className="text-xs text-muted-foreground">{loadError.message}</p>
        </div>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-muted rounded-lg border">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading map...</p>
        </div>
      </div>
    )
  }

  useEffect(() => {
    if (!map) return

    markers.forEach((marker) => marker.setMap(null))

    const newMarkers = properties
      .filter((p) => p.latitude && p.longitude)
      .map((property) => {
        const price = property.private_room_price || property.double_sharing_price || 0

        const marker = new google.maps.Marker({
          position: { lat: property.latitude, lng: property.longitude },
          map,
          title: property.title,
          label: {
            text: `₹${(price / 1000).toFixed(0)}k`,
            color: "white",
            fontSize: "12px",
            fontWeight: "bold",
          },
        })

        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div style="padding: 8px; max-width: 200px;">
              ${property.images && property.images[0]
              ? `<img src="${property.images[0]}" alt="${property.title}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 4px; margin-bottom: 8px;" />`
              : ""
            }
              <h3 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600;">${property.title
            }</h3>
              <p style="margin: 0; font-size: 12px; color: #666;">₹${price.toLocaleString()}/month</p>
            </div>
          `,
        })

        marker.addListener("click", () => {
          infoWindow.open(map, marker)
          onMarkerClick?.(property.id)
        })

        return marker
      })

    setMarkers(newMarkers)

    if (newMarkers.length > 0) {
      const bounds = new google.maps.LatLngBounds()
      newMarkers.forEach((marker) => {
        const position = marker.getPosition()
        if (position) bounds.extend(position)
      })
      map.fitBounds(bounds)
    }
  }, [map, properties, onMarkerClick])

  return (
    <div
      ref={mapRef}
      style={{ width: "100%", height: "100%", minHeight: "400px" }}
      className="rounded-lg"
    />
  )
}
