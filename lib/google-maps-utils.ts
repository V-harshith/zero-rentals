/**
 * Google Maps Utilities
 * Provides autocomplete, geocoding, and place details functionality
 */

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
import { loadGoogleMapsAPI } from './google-maps-loader'

export interface PlaceSuggestion {
    placeId: string
    description: string
    mainText: string
    secondaryText: string
    sublocality?: string  // Optional: sublocality/area name for display
    city?: string  // Optional: city name
}

export interface PlaceDetails {
    placeId: string
    formattedAddress: string
    latitude: number
    longitude: number
    city?: string
    state?: string
    country?: string
    postalCode?: string
    // NEW: Sublocality/area for precise location search
    sublocality?: string  // e.g., "BTM Layout", "Koramangala", "HSR Layout"
}

/**
 * Get autocomplete suggestions for a location query
 * Note: This should ideally call a server-side API route to avoid exposing API key
 */
export async function getPlaceSuggestions(
    input: string,
    sessionToken?: string
): Promise<PlaceSuggestion[]> {
    if (!input || input.length < 3) return []

    if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'AIzaSy_your_google_maps_api_key_here') {
        console.warn('Google Maps API key not configured')
        return []
    }

    try {
        // Ensure API is loaded
        const maps = await loadGoogleMapsAPI()

        // Check if places library is available
        if (!maps || !maps.places) {
            console.warn('Google Maps Places library not loaded')
            return []
        }

        return new Promise((resolve) => {
            const service = new maps.places.AutocompleteService()
            service.getPlacePredictions(
                {
                    input,
                    componentRestrictions: { country: 'in' },
                    types: ['geocode'],
                    sessionToken: sessionToken ? new maps.places.AutocompleteSessionToken() : undefined
                },
                (predictions, status) => {
                    if (status === maps.places.PlacesServiceStatus.OK && predictions) {
                        resolve(predictions.map((prediction: any) => ({
                            placeId: prediction.place_id,
                            description: prediction.description,
                            mainText: prediction.structured_formatting.main_text,
                            secondaryText: prediction.structured_formatting.secondary_text || '',
                        })))
                    } else {
                        if (status !== maps.places.PlacesServiceStatus.ZERO_RESULTS) {
                            console.warn('Places autocomplete status:', status)
                        }
                        resolve([])
                    }
                }
            )
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('Error fetching place suggestions:', errorMessage)
        return []
    }
}

/**
 * Get detailed information about a place
 */
export async function getPlaceDetailsById(placeId: string): Promise<PlaceDetails | null> {
    if (!GOOGLE_MAPS_API_KEY) {
        console.warn('Google Maps API key not configured')
        return null
    }

    try {
        const maps = await loadGoogleMapsAPI()

        // Check if places library is available
        if (!maps || !maps.places) {
            console.warn('Google Maps Places library not loaded')
            return null
        }

        return new Promise((resolve) => {
            // Create a dummy element for the service (required)
            const dummyElement = document.createElement('div')
            const service = new maps.places.PlacesService(dummyElement)

            service.getDetails(
                {
                    placeId: placeId,
                    fields: ['formatted_address', 'geometry', 'address_components']
                },
                (place, status) => {
                    if (status === maps.places.PlacesServiceStatus.OK && place && place.geometry && place.geometry.location) {
                        const location = place.geometry.location
                        const addressComponents = place.address_components || []

                        const city = addressComponents.find((c: any) =>
                            c.types.includes('locality')
                        )?.long_name

                        const state = addressComponents.find((c: any) =>
                            c.types.includes('administrative_area_level_1')
                        )?.long_name

                        const country = addressComponents.find((c: any) =>
                            c.types.includes('country')
                        )?.long_name
                        const postalCode = addressComponents.find((c: any) =>
                            c.types.includes('postal_code')
                        )?.long_name

                        // Extract sublocality/area (e.g., "BTM Layout", "Koramangala")
                        // Priority: sublocality > neighborhood > administrative_area_level_2 > administrative_area_level_3
                        const sublocality = addressComponents.find((c: any) =>
                            c.types.includes('sublocality') ||
                            c.types.includes('sublocality_level_1')
                        )?.long_name ||
                        addressComponents.find((c: any) =>
                            c.types.includes('neighborhood')
                        )?.long_name ||
                        addressComponents.find((c: any) =>
                            c.types.includes('administrative_area_level_2')
                        )?.long_name ||
                        addressComponents.find((c: any) =>
                            c.types.includes('administrative_area_level_3')
                        )?.long_name

                        resolve({
                            placeId,
                            formattedAddress: place.formatted_address || '',
                            latitude: location.lat(),
                            longitude: location.lng(),
                            city,
                            state,
                            country,
                            postalCode,
                            sublocality,
                        })
                    } else {
                        console.error('Place details failed status:', status)
                        resolve(null)
                    }
                }
            )
        })
    } catch (error) {
        console.error('Error getting place details:', error)
        return null
    }
}

/**
 * Get human-readable address from coordinates (Reverse Geocoding)
 */
export async function getReverseGeocoding(lat: number, lng: number): Promise<string | null> {
    if (!GOOGLE_MAPS_API_KEY) return null

    try {
        const maps = await loadGoogleMapsAPI()
        if (!maps || !maps.Geocoder) return null

        return new Promise((resolve) => {
            const geocoder = new maps.Geocoder()
            geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
                if (status === "OK" && results[0]) {
                    // Try to get a concise locality/sublocality first
                    const components = results[0].address_components || []
                    const locality = components.find((c: any) => c.types.includes("locality"))?.long_name
                    const sublocality = components.find((c: any) => c.types.includes("sublocality"))?.long_name
                    const area = components.find((c: any) => c.types.includes("administrative_area_level_2"))?.long_name

                    // Return the most specific location available
                    if (sublocality && locality) {
                        resolve(`${sublocality}, ${locality}`)
                        return
                    }
                    if (locality) {
                        resolve(locality)
                        return
                    }
                    if (area) {
                        resolve(area)
                        return
                    }

                    resolve(results[0].formatted_address)
                } else {
                    console.error("Reverse geocoding failed:", status)
                    resolve(null)
                }
            })
        })
    } catch (error) {
        console.error("Error in reverse geocoding:", error)
        return null
    }
}

/**
 * Generate a session token for autocomplete requests
 * This helps reduce costs by grouping related requests
 */
export function generateSessionToken(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
}

/**
 * Debounce function for autocomplete input
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null

    return function executedFunction(...args: Parameters<T>) {
        const later = () => {
            timeout = null
            func(...args)
        }

        if (timeout) {
            clearTimeout(timeout)
        }
        timeout = setTimeout(later, wait)
    }
}
