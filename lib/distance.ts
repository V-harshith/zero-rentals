export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371 // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = R * c

  return distance
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180)
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }
  return `${(meters / 1000).toFixed(1)} km`
}

export async function getDistanceMatrix(
  origins: string[],
  destinations: string[]
): Promise<any> {
  const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'AIzaSy_your_google_maps_api_key_here') {
    console.warn('Google Maps API key not configured')
    return null
  }

  try {
    const originsStr = origins.join('|')
    const destinationsStr = destinations.join('|')
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(
      originsStr
    )}&destinations=${encodeURIComponent(destinationsStr)}&key=${GOOGLE_MAPS_API_KEY}`

    const response = await fetch(url)
    const data = await response.json()

    if (data.status !== 'OK') {
      console.error('Distance matrix failed:', data.status)
      return null
    }

    return data
  } catch (error) {
    console.error('Error getting distance matrix:', error)
    return null
  }
}
