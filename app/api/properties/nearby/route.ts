import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { calculateDistance } from '@/lib/distance'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const lat = parseFloat(searchParams.get('lat') || '0')
    const lng = parseFloat(searchParams.get('lng') || '0')
    const radius = parseFloat(searchParams.get('radius') || '5') // km

    if (!lat || !lng) {
      return NextResponse.json({ error: 'Latitude and longitude required' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('status', 'active')
      .eq('availability', 'Available')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)

    if (error) throw error

    const propertiesWithDistance = data
      .map((property) => {
        const distance = calculateDistance(
          lat,
          lng,
          property.latitude,
          property.longitude
        )
        return { ...property, distance }
      })
      .filter((property) => property.distance <= radius)
      .sort((a, b) => a.distance - b.distance)

    return NextResponse.json({ data: propertiesWithDistance })
  } catch (error: any) {
    console.error('Error fetching nearby properties:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
