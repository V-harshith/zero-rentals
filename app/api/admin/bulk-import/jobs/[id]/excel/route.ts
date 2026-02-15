import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import crypto from "crypto"

// ============================================================================
// AMENITY MAPPING
// ============================================================================
const AMENITY_MAP: Record<string, string> = {
    'wifi': 'WiFi',
    'wi-fi': 'WiFi',
    'internet': 'WiFi',
    'food': 'Meals',
    'meals': 'Meals',
    'tiffin': 'Meals',
    'house keeping': 'Cleaning',
    'housekeeping': 'Cleaning',
    'cleaning': 'Cleaning',
    'washing machine': 'Laundry',
    'laundry': 'Laundry',
    'cctv': 'Security',
    'security': 'Security',
    'security guard': 'Security',
    'ac': 'AC',
    'air conditioning': 'AC',
    'parking': 'Parking',
    'bike parking': 'Parking',
    'car parking': 'Parking',
    'power backup': 'Power Backup',
    'generator': 'Power Backup',
    'inverter': 'Power Backup',
    'water heater': 'Geyser',
    'geyser': 'Geyser',
    'hot water': 'Geyser',
    'gym': 'Gym',
    'tv': 'TV',
    'television': 'TV',
    'fridge': 'Fridge',
    'refrigerator': 'Fridge',
    'ro water': 'Water Purifier',
    'water purifier': 'Water Purifier',
    'ro': 'Water Purifier',
}

function mapAmenities(facilitiesString: string | null): string[] {
    if (!facilitiesString) return []

    const facilities = facilitiesString.toLowerCase().split(',').map(f => f.trim()).filter(Boolean)
    const mapped = new Set<string>()

    for (const facility of facilities) {
        if (AMENITY_MAP[facility]) {
            mapped.add(AMENITY_MAP[facility])
            continue
        }
        for (const [key, value] of Object.entries(AMENITY_MAP)) {
            if (facility.includes(key) || key.includes(facility)) {
                mapped.add(value)
                break
            }
        }
    }

    return Array.from(mapped)
}

function getPropertyType(pgFor: string | null): 'PG' | 'Co-living' | 'Rent' {
    if (!pgFor) return 'PG'
    const lower = pgFor.toLowerCase()
    if (lower.includes('co-living') || lower.includes('coliving')) return 'Co-living'
    if (lower.includes('rent') || lower.includes('apartment')) return 'Rent'
    return 'PG'
}

function getPreferredTenant(pgFor: string | null): 'Male' | 'Female' | 'Any' {
    if (!pgFor) return 'Any'
    const lower = pgFor.toLowerCase()
    if (lower.includes('gent') || lower.includes('male') || lower.includes('boys')) return 'Male'
    if (lower.includes('ladies') || lower.includes('female') || lower.includes('girls')) return 'Female'
    return 'Any'
}

function parsePrice(value: unknown): number | null {
    if (value === null || value === undefined || value === '' || value === 'None' || value === '-') return null
    const num = Number(value)
    return isNaN(num) || num <= 0 ? null : num
}

function determineRoomType(row: Record<string, unknown>): string {
    if (parsePrice(row['Private Room'])) return 'Single'
    if (parsePrice(row['Double Sharing'])) return 'Double'
    // Handle typo in Excel: "TrippleSharing" (3 p's) vs "Triple Sharing" (correct)
    if (parsePrice(row['Triple Sharing']) || parsePrice(row['TrippleSharing'])) return 'Triple'
    if (parsePrice(row['Four Sharing'])) return 'Four Sharing'
    return 'Single'
}

function generatePassword(): string {
    return crypto.randomBytes(8).toString('base64url').slice(0, 12) + '!A1'
}

// ============================================================================
// POST /api/admin/bulk-import/jobs/[id]/excel
// Upload and parse Excel file
// ============================================================================
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: jobId } = await params

        // Auth check
        const supabase = await createClient()
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !authUser) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // Verify job exists and belongs to admin
        const { data: job } = await supabaseAdmin
            .from("bulk_import_jobs")
            .select("id, status")
            .eq("id", jobId)
            .eq("admin_id", authUser.id)
            .single()

        if (!job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 })
        }

        if (job.status !== "created" && job.status !== "excel_parsed") {
            return NextResponse.json(
                { error: "Job is not in a state to accept Excel upload" },
                { status: 400 }
            )
        }

        // Parse form data
        const formData = await request.formData()
        const file = formData.get("file") as File

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 })
        }

        // Validate file type
        if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
            return NextResponse.json(
                { error: "Invalid file type. Please upload .xlsx or .xls file" },
                { status: 400 }
            )
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json(
                { error: "File too large. Maximum size is 10MB" },
                { status: 400 }
            )
        }

        // Update job status
        await supabaseAdmin
            .from("bulk_import_jobs")
            .update({
                status: "parsing_excel",
                excel_file_name: file.name,
                excel_file_size: file.size,
            })
            .eq("id", jobId)

        // Parse Excel
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const rawData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[]

        if (rawData.length === 0) {
            return NextResponse.json({ error: "Excel file is empty" }, { status: 400 })
        }

        if (rawData.length > 1000) {
            return NextResponse.json(
                { error: "Too many rows. Maximum is 1000 properties per import" },
                { status: 400 }
            )
        }

        // Process and validate each row
        const properties: any[] = []
        const errors: string[] = []
        const ownerEmails = new Map<string, { name: string; phone: string; properties: string[] }>()

        for (let i = 0; i < rawData.length; i++) {
            const row = rawData[i]
            const rowNum = i + 2 // Excel row number (1-based + header)

            try {
                // Required fields
                const psn = String(row['PSN'] || '').trim()
                const propertyName = String(row['Property Name'] || '').trim()
                const ownerEmail = String(row['Email'] || '').trim().toLowerCase()
                const ownerName = String(row['Owner Name'] || '').trim()
                const ownerPhone = String(row['Owner Contact'] || '').trim()
                const city = String(row['City'] || '').trim()
                const area = String(row['Area'] || '').trim()

                // Validate required fields
                if (!psn) {
                    errors.push(`Row ${rowNum}: PSN is required`)
                    continue
                }
                if (!propertyName) {
                    errors.push(`Row ${rowNum}: Property Name is required`)
                    continue
                }

                // Strict email validation - reject phone number emails
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
                const isPhoneEmail = /^\d+@/.test(ownerEmail) || !ownerEmail.includes('@')

                if (!ownerEmail) {
                    errors.push(`Row ${rowNum}: Email is required`)
                    continue
                }
                if (isPhoneEmail) {
                    errors.push(`Row ${rowNum}: Invalid email "${ownerEmail}" - phone numbers cannot be used as emails. Please provide a valid email address.`)
                    continue
                }
                if (!emailRegex.test(ownerEmail)) {
                    errors.push(`Row ${rowNum}: Invalid email format "${ownerEmail}"`)
                    continue
                }

                if (!ownerName) {
                    errors.push(`Row ${rowNum}: Owner Name is required`)
                    continue
                }
                if (!city) {
                    errors.push(`Row ${rowNum}: City is required`)
                    continue
                }
                if (!area) {
                    errors.push(`Row ${rowNum}: Area is required`)
                    continue
                }

                // Check for duplicate PSN in this import
                if (properties.some(p => p.psn === psn)) {
                    errors.push(`Row ${rowNum}: Duplicate PSN "${psn}" in import file`)
                    continue
                }

                // Parse pricing
                const pgFor = String(row["PG's for"] || row["PG's For"] || '')
                const privateRoomPrice = parsePrice(row['Private Room'])
                const doubleSharingPrice = parsePrice(row['Double Sharing'])
                // Handle typo: "TrippleSharing" vs "Triple Sharing"
                const tripleSharingPrice = parsePrice(row['Triple Sharing']) || parsePrice(row['TrippleSharing'])
                const fourSharingPrice = parsePrice(row['Four Sharing'])

                // At least one price should be present
                if (!privateRoomPrice && !doubleSharingPrice && !tripleSharingPrice && !fourSharingPrice) {
                    errors.push(`Row ${rowNum}: At least one room price is required`)
                    continue
                }

                // Build full address for Google Maps
                const fullAddress = `${propertyName}, ${area}, ${city}${row['Landmark'] ? ', Near ' + row['Landmark'] : ''}`
                const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`

                // Build property data - matches normal property posting structure
                const propertyData = {
                    title: propertyName,
                    description: String(row['USP'] || row['Landmark'] || '').replace(/^None$/i, '') || `${propertyName} - ${getPreferredTenant(pgFor)} ${getPropertyType(pgFor)}`,
                    property_type: getPropertyType(pgFor),
                    room_type: determineRoomType(row),

                    city: city,
                    area: area,
                    locality: String(row['Locality'] || area),
                    address: String(row['Address'] || `${propertyName}, ${area}`),
                    landmark: String(row['Landmark'] || ''),
                    google_maps_url: googleMapsUrl,

                    country: String(row['Country'] || 'India'),

                    private_room_price: privateRoomPrice,
                    double_sharing_price: doubleSharingPrice,
                    triple_sharing_price: tripleSharingPrice,
                    four_sharing_price: fourSharingPrice,
                    deposit: parsePrice(row['Deposit']),

                    amenities: mapAmenities(String(row['Facilities'] || '')),
                    preferred_tenant: getPreferredTenant(pgFor),
                    usp: String(row['USP'] || '').replace(/^None$/i, ''),

                    // Default values matching normal property post
                    status: 'active',
                    availability: 'Available',
                    featured: false,
                    verified: false,
                    views: 0,
                    source: 'bulk_import',
                    psn: psn,
                    owner_verified: false,

                    // Additional fields for better filtering
                    laundry: String(row['Facilities'] || '').toLowerCase().includes('laundry') ||
                             String(row['Facilities'] || '').toLowerCase().includes('washing'),
                    room_cleaning: String(row['Facilities'] || '').toLowerCase().includes('house keeping') ||
                                   String(row['Facilities'] || '').toLowerCase().includes('housekeeping') ||
                                   String(row['Facilities'] || '').toLowerCase().includes('cleaning'),
                    warden: String(row['Facilities'] || '').toLowerCase().includes('warden'),
                    parking: String(row['Facilities'] || '').toLowerCase().includes('parking') ? 'Bike' : 'None',
                }

                // Track owner
                if (!ownerEmails.has(ownerEmail)) {
                    ownerEmails.set(ownerEmail, {
                        name: ownerName,
                        phone: ownerPhone,
                        properties: [],
                    })
                }
                ownerEmails.get(ownerEmail)!.properties.push(propertyName)

                properties.push({
                    row_number: rowNum,
                    psn: psn,
                    property_name: propertyName,
                    owner_email: ownerEmail,
                    owner_name: ownerName,
                    owner_phone: ownerPhone,
                    property_data: propertyData,
                })
            } catch (error: any) {
                errors.push(`Row ${rowNum}: ${error.message}`)
            }
        }

        // Check for existing owners in database
        const existingOwners: string[] = []
        const newOwners: any[] = []

        for (const [email, info] of ownerEmails) {
            const { data: existingUser } = await supabaseAdmin
                .from("users")
                .select("id, email")
                .eq("email", email)
                .maybeSingle()

            if (existingUser) {
                existingOwners.push(email)
            } else {
                newOwners.push({
                    email,
                    name: info.name,
                    phone: info.phone,
                    password: generatePassword(),
                    properties: info.properties,
                })
            }
        }

        // Update job with parsed data
        await supabaseAdmin
            .from("bulk_import_jobs")
            .update({
                status: "excel_parsed",
                step: "image_upload",
                total_properties: properties.length,
                parsed_properties: properties,
                new_owners: newOwners.map(o => ({
                    email: o.email,
                    name: o.name,
                    phone: o.phone,
                    password_encrypted: Buffer.from(o.password).toString('base64'),
                    properties: o.properties,
                })),
                existing_owners_matched: existingOwners.length,
                excel_uploaded_at: new Date().toISOString(),
            })
            .eq("id", jobId)

        // Log audit
        await supabaseAdmin.from("bulk_import_audit_log").insert({
            job_id: jobId,
            admin_id: authUser.id,
            action: "excel_uploaded",
            details: {
                file_name: file.name,
                total_rows: rawData.length,
                valid_properties: properties.length,
                errors: errors.length,
                new_owners: newOwners.length,
                existing_owners: existingOwners.length,
            },
        })

        return NextResponse.json({
            success: true,
            total_rows: rawData.length,
            valid_properties: properties.length,
            errors: errors,
            new_owners: newOwners.length,
            existing_owners: existingOwners.length,
            psn_list: properties.map(p => p.psn),
        })
    } catch (error: any) {
        console.error("Excel upload error:", error)

        // Update job with error
        await supabaseAdmin
            .from("bulk_import_jobs")
            .update({
                status: "failed",
                error_message: error.message,
                error_details: { stack: error.stack },
            })
            .eq("id", params.id)

        return NextResponse.json(
            { error: error.message || "Failed to process Excel file" },
            { status: 500 }
        )
    }
}
