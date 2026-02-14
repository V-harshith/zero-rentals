const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

export interface GeocodingResult {
  latitude: number
  longitude: number
  formattedAddress: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
}

export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'AIzaSy_your_google_maps_api_key_here') {
    console.warn('Google Maps API key not configured')
    return null
  }

  try {
    const encodedAddress = encodeURIComponent(address)
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_MAPS_API_KEY}`

    const response = await fetch(url)
    const data = await response.json()

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      console.error('Geocoding failed:', data.status)
      return null
    }

    const result = data.results[0]
    const location = result.geometry.location

    const addressComponents = result.address_components
    const city = addressComponents.find((c: any) => c.types.includes('locality'))?.long_name
    const state = addressComponents.find((c: any) => c.types.includes('administrative_area_level_1'))?.long_name
    const country = addressComponents.find((c: any) => c.types.includes('country'))?.long_name
    const postalCode = addressComponents.find((c: any) => c.types.includes('postal_code'))?.long_name

    return {
      latitude: location.lat,
      longitude: location.lng,
      formattedAddress: result.formatted_address,
      city,
      state,
      country,
      postalCode,
    }
  } catch (error) {
    console.error('Error geocoding address:', error)
    return null
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'AIzaSy_your_google_maps_api_key_here') {
    console.warn('Google Maps API key not configured')
    return null
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`

    const response = await fetch(url)
    const data = await response.json()

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      console.error('Reverse geocoding failed:', data.status)
      return null
    }

    return data.results[0].formatted_address
  } catch (error) {
    console.error('Error reverse geocoding:', error)
    return null
  }
}

export async function getPlaceDetails(placeId: string): Promise<any> {
  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'AIzaSy_your_google_maps_api_key_here') {
    console.warn('Google Maps API key not configured')
    return null
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${GOOGLE_MAPS_API_KEY}`

    const response = await fetch(url)
    const data = await response.json()

    if (data.status !== 'OK') {
      console.error('Place details failed:', data.status)
      return null
    }

    return data.result
  } catch (error) {
    console.error('Error getting place details:', error)
    return null
  }
}
