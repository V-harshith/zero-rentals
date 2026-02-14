import { NextRequest, NextResponse } from 'next/server'
import { geocodeAddress } from '@/lib/geocoding'
import { createSafeErrorResponse } from '@/lib/api-utils'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { address } = body

    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 })
    }

    const result = await geocodeAddress(address)

    if (!result) {
      return NextResponse.json({ error: 'Geocoding failed' }, { status: 400 })
    }

    return NextResponse.json({ data: result })
  } catch (error: any) {
    return createSafeErrorResponse(error, 'Geocode', 500)
  }
}
