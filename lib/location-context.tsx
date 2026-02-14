"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { toast } from "sonner"

interface LocationContextType {
    userLocation: GeolocationCoordinates | null
    locationPermission: PermissionState | null
    requestLocation: () => Promise<void>
    calculateDistance: (lat: number, lng: number) => number | null
    isLoading: boolean
    error: string | null
}

const LocationContext = createContext<LocationContextType | undefined>(undefined)

export function LocationProvider({ children }: { children: ReactNode }) {
    const [userLocation, setUserLocation] = useState<GeolocationCoordinates | null>(null)
    const [locationPermission, setLocationPermission] = useState<PermissionState | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Check permission status on mount
    useEffect(() => {
        if (typeof window !== "undefined" && "permissions" in navigator) {
            navigator.permissions.query({ name: "geolocation" }).then((result) => {
                setLocationPermission(result.state)

                // DON'T auto-request - let user explicitly request via UI
                // This prevents unwanted popup on every page load
            })
        }
    }, [])

    const requestLocation = async () => {
        // 1. Check if geolocation is supported
        if (!navigator.geolocation) {
            const errorMsg = "Geolocation is not supported by your browser"
            setError(errorMsg)
            toast.error(errorMsg)
            return
        }

        // 2. Check if running in secure context (HTTPS or localhost)
        if (!window.isSecureContext) {
            const errorMsg = "Geolocation requires a secure connection (HTTPS)"
            setError(errorMsg)
            toast.error("Location access unavailable", {
                description: "Please use HTTPS or localhost"
            })
            return
        }

        setIsLoading(true)
        setError(null)

        try {


            // 4. Request geolocation
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        resolve(pos)
                    },
                    (error) => {
                        reject(error)
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 0
                    }
                )
            })

            setUserLocation(position.coords)
            setLocationPermission("granted")
            toast.success("Location access granted!")

        } catch (err: any) {

            let errorMessage = "Unable to get your location"

            // Handle GeolocationPositionError
            if (err && typeof err === 'object' && 'code' in err) {
                switch (err.code) {
                    case 1: // PERMISSION_DENIED
                        errorMessage = "Location access denied. Please enable location in your browser settings."
                        setLocationPermission("denied")
                        break
                    case 2: // POSITION_UNAVAILABLE
                        errorMessage = "Location unavailable. Please check your device's location settings."
                        break
                    case 3: // TIMEOUT
                        errorMessage = "Location request timed out. Please try again."
                        break
                    default:
                        errorMessage = err.message || "Unknown location error"
                }
            } else if (err?.message) {
                errorMessage = err.message
            }

            setError(errorMessage)
            toast.error(errorMessage, {
                description: "You can still search by entering a location manually"
            })
        } finally {
            setIsLoading(false)
        }
    }

    // Calculate distance between user and a point (in km)
    const calculateDistance = (lat: number, lng: number): number | null => {
        if (!userLocation) return null

        const R = 6371 // Earth's radius in km
        const dLat = toRad(lat - userLocation.latitude)
        const dLon = toRad(lng - userLocation.longitude)

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(userLocation.latitude)) *
            Math.cos(toRad(lat)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2)

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        const distance = R * c

        return Math.round(distance * 10) / 10 // Round to 1 decimal
    }

    const toRad = (value: number) => (value * Math.PI) / 180

    return (
        <LocationContext.Provider
            value={{
                userLocation,
                locationPermission,
                requestLocation,
                calculateDistance,
                isLoading,
                error
            }}
        >
            {children}
        </LocationContext.Provider>
    )
}

export function useLocation() {
    const context = useContext(LocationContext)
    if (context === undefined) {
        throw new Error("useLocation must be used within a LocationProvider")
    }
    return context
}
