import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'
import * as XLSX from 'xlsx'

// Maximum number of rows to import (prevent OOM)
const MAX_IMPORT_ROWS = 1000

export async function POST(request: NextRequest) {
    try {
        // CSRF Protection
        const csrfCheck = await csrfProtection(request)
        if (!csrfCheck.valid) {
            return NextResponse.json({ error: csrfCheck.error || 'Invalid request' }, { status: 403 })
        }

        // Rate limiting: 5 imports per hour per admin
        const rateLimitKey = `admin:import:properties:${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'}`
        const rateLimitResult = await rateLimit(rateLimitKey, 5, 60 * 60 * 1000)
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again later.' },
                { status: 429 }
            )
        }

        const supabase = await createClient()

        // Get authenticated user
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !authUser) {
            return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 })
        }

        // Get user profile with role
        const { data: userProfile, error: profileError } = await supabase
            .from('users')
            .select('role')
            .eq('id', authUser.id)
            .single()

        if (profileError || !userProfile || userProfile.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
        }

        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 })
        }

        // Validate file type
        const validTypes = ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv']
        if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
            return NextResponse.json({ error: 'Invalid file type. Please upload an Excel or CSV file.' }, { status: 400 })
        }

        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024
        if (file.size > maxSize) {
            return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 })
        }

        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer)
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(worksheet)

        // Validate row count
        if (data.length > MAX_IMPORT_ROWS) {
            return NextResponse.json(
                { error: `Too many rows. Maximum allowed is ${MAX_IMPORT_ROWS}` },
                { status: 400 }
            )
        }

        const results = {
            success: 0,
            failed: 0,
            errors: [] as string[]
        }

        for (const [index, row] of (data as Record<string, unknown>[]).entries()) {
            try {
                // Parse images from comma-separated URLs
                // Helper to get value from multiple possible keys (case insensitive check could be better but explicit is safer for now)
                const getVal = (keys: string[]) => {
                    for (const k of keys) {
                        if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k]
                    }
                    return null
                }

                // Map Excel headers to DB columns
                const title = getVal(['title', 'Property Name'])
                const propertyType = getVal(['property_type']) || 'PG' // Default to PG if not specified
                const preferredTenant = getVal(['preferred_tenant', "PG's For"])

                // Parse facilities from either 'facilities' (db key) or 'Facilities' (excel key)
                const facilitiesRaw = getVal(['facilities', 'Facilities'])
                const facilities = facilitiesRaw ? String(facilitiesRaw).split(',').map(f => f.trim()) : []

                // Parse images
                const imagesRaw = getVal(['images'])
                const images = imagesRaw ? String(imagesRaw).split(',').map(url => url.trim()) : []

                const propertyData = {
                    title: title,
                    description: getVal(['description']),
                    property_type: propertyType,
                    room_type: getVal(['room_type']) || 'Shared Room', // Default
                    country: getVal(['country', 'Country']) || 'India',
                    city: getVal(['city', 'City']),
                    area: getVal(['area', 'Area']),
                    locality: getVal(['locality', 'Locality']),
                    address: getVal(['address']),
                    landmark: getVal(['landmark', 'Landmark']),
                    latitude: row.latitude ? parseFloat(String(row.latitude)) : null,
                    longitude: row.longitude ? parseFloat(String(row.longitude)) : null,
                    google_maps_url: getVal(['google_maps_url', 'Location']),
                    owner_id: getVal(['owner_id']) || authUser.id,
                    owner_name: getVal(['owner_name', 'Owner Name']),
                    owner_contact: getVal(['owner_contact', 'Owner Contact']),
                    owner_verified: row.owner_verified === 'true' || row.owner_verified === true,
                    private_room_price: row.private_room_price ? parseFloat(String(row.private_room_price)) : null,
                    double_sharing_price: getVal(['double_sharing_price', 'Double Sharing']) ? parseFloat(String(getVal(['double_sharing_price', 'Double Sharing']))) : null,
                    triple_sharing_price: getVal(['triple_sharing_price', 'Triple Sharing']) ? parseFloat(String(getVal(['triple_sharing_price', 'Triple Sharing']))) : null,
                    four_sharing_price: row.four_sharing_price ? parseFloat(String(row.four_sharing_price)) : null,
                    deposit: getVal(['deposit', 'Deposit']) ? parseFloat(String(getVal(['deposit', 'Deposit']))) : null,
                    maintenance: row.maintenance ? parseFloat(String(row.maintenance)) : null,
                    furnishing: row.furnishing || null,
                    floor_number: row.floor_number ? parseInt(String(row.floor_number)) : null,
                    total_floors: row.total_floors ? parseInt(String(row.total_floors)) : null,
                    room_size: row.room_size ? parseFloat(String(row.room_size)) : null,
                    preferred_tenant: preferredTenant,
                    facilities: facilities,
                    amenities: row.amenities ? String(row.amenities).split(',').map((a: string) => a.trim()) : [],
                    usp: getVal(['usp']),
                    rules: row.rules ? String(row.rules).split(',').map((r: string) => r.trim()) : [],
                    nearby_places: row.nearby_places ? String(row.nearby_places).split(',').map((p: string) => p.trim()) : [],
                    images: images,
                    videos: row.videos ? String(row.videos).split(',').map((v: string) => v.trim()) : [],
                    availability: getVal(['availability']) || 'Available',
                    featured: row.featured === 'true' || row.featured === true || false,
                    verified: row.verified === 'true' || row.verified === true || false,
                    status: getVal(['status']) || 'active',
                    psn: getVal(['psn']),
                    source: getVal(['source']) || 'bulk_import'
                }

                const { error } = await supabase
                    .from('properties')
                    .insert(propertyData)

                if (error) {
                    results.failed++
                    results.errors.push(`Row ${index + 1}: ${error.message}`)
                } else {
                    results.success++
                }
            } catch (err) {
                results.failed++
                const message = err instanceof Error ? err.message : 'Unknown error'
                results.errors.push(`Row ${index + 1}: ${message}`)
            }
        }

        return NextResponse.json({
            message: `Import completed. ${results.success} properties added, ${results.failed} failed.`,
            results
        })
    } catch (error) {
        console.error('Error importing properties:', error)
        return NextResponse.json({ error: 'Failed to import properties' }, { status: 500 })
    }
}
