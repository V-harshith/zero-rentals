import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { csrfProtection } from "@/lib/csrf-server"
import crypto from "crypto"
import { encrypt, isEncryptionConfigured } from "@/lib/encryption"
import { hasConcurrentProcessingJob } from "@/lib/bulk-import-queue"

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

function getPropertyType(propertyType: string | null): 'PG' | 'Co-living' | 'Rent' {
    if (!propertyType) return 'PG'
    const lower = propertyType.toLowerCase().trim()
    if (lower === 'co-living' || lower === 'coliving') return 'Co-living'
    if (lower === 'rent' || lower === 'rental' || lower === 'apartment') return 'Rent'
    if (lower === 'pg' || lower === 'p.g' || lower === 'paying guest') return 'PG'
    return 'PG'
}

function getPreferredTenant(pgFor: string | null): 'Male' | 'Female' | 'Any' {
    if (!pgFor) return 'Any'
    const lower = pgFor.toLowerCase().trim()
    // Male keywords: Male, Mens, Gents, Boys
    if (lower.includes('male') || lower.includes('mens') || lower.includes('gent') || lower.includes('boys')) return 'Male'
    // Female keywords: Female, Ladies, Girls
    if (lower.includes('female') || lower.includes('ladies') || lower.includes('girls')) return 'Female'
    return 'Any'
}

function parsePrice(value: unknown): number | null {
    if (value === null || value === undefined || value === '' || value === 'None' || value === '-') return null
    const num = Number(value)
    return isNaN(num) || num <= 0 ? null : num
}

function determineRoomType(row: Record<string, unknown>): string {
    if (parsePrice(getColumnValue(row, COLUMN_NAMES.ONE_RK))) return '1RK'
    if (parsePrice(getColumnValue(row, COLUMN_NAMES.PRIVATE_ROOM))) return 'Single'
    if (parsePrice(getColumnValue(row, COLUMN_NAMES.DOUBLE_SHARING))) return 'Double'
    if (parsePrice(getColumnValue(row, COLUMN_NAMES.TRIPLE_SHARING))) return 'Triple'
    if (parsePrice(getColumnValue(row, COLUMN_NAMES.FOUR_SHARING))) return 'Four Sharing'
    return 'Single'
}

function generatePassword(): string {
    return crypto.randomBytes(8).toString('base64url').slice(0, 12) + '!A1'
}

// ============================================================================
// COLUMN MAPPING - Support both old and new Excel formats
// ============================================================================

/**
 * Helper function to get values from multiple possible column names.
 * Returns the first non-empty value found, or undefined if none match.
 */
function getColumnValue(row: Record<string, unknown>, possibleNames: string[]): unknown {
    for (const name of possibleNames) {
        if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
            return row[name]
        }
    }
    return undefined
}

// Column name mappings for backward compatibility
const COLUMN_NAMES = {
    PSN: ['PSN', 'psn'],
    PROPERTY_NAME: ['Property Name', 'title', 'property_name', 'name'],
    EMAIL: ['Email', 'email', 'owner_email'],
    OWNER_NAME: ['Owner Name', 'owner_name', 'ownerName'],
    OWNER_CONTACT: ['Owner Contact', 'owner_contact', 'ownerContact', 'phone'],
    CITY: ['City', 'city'],
    AREA: ['Area', 'area', 'locality'],
    ADDRESS: ['Address', 'address', 'street_address'],
    COUNTRY: ['Country', 'country'],
    LOCALITY: ['Locality', 'locality'],
    LANDMARK: ['Landmark', 'landmark'],
    USP: ['USP', 'usp'],
    FACILITIES: ['Facilities', 'facilities'],
    PROPERTY_TYPE: ['Property Type', 'Property_Type', 'property_type', 'Type', 'type'],
    PG_FOR: ["PG's for", "PG's For", "pg_for", "PGFor"],
    PRIVATE_ROOM: ['Private Room', 'private_room_price'],
    DOUBLE_SHARING: ['Double Sharing', 'double_sharing_price'],
    TRIPLE_SHARING: ['Triple Sharing', 'triple_sharing_price', 'TrippleSharing'],
    FOUR_SHARING: ['Four Sharing', 'four_sharing_price'],
    ONE_RK: ['1RK', 'one_rk_price'],
    DEPOSIT: ['Deposit', 'deposit'],
}

// ============================================================================
// POST /api/admin/bulk-import/jobs/[id]/excel
// Upload and parse Excel file
// ============================================================================
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    let jobId = ''
    try {
        const { id } = await params
        jobId = id

        // CSRF protection
        const csrfCheck = await csrfProtection(request)
        if (!csrfCheck.valid) {
            return NextResponse.json({ error: csrfCheck.error || 'Invalid request' }, { status: 403 })
        }

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

        // Check for concurrent processing job
        const hasConcurrent = await hasConcurrentProcessingJob(authUser.id)
        if (hasConcurrent) {
            return NextResponse.json(
                { error: "You have an import job currently being processed. Please wait for it to complete." },
                { status: 429 }
            )
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
                // Required fields - using getColumnValue for backward compatibility
                const psn = String(getColumnValue(row, COLUMN_NAMES.PSN) || '').trim()
                const propertyName = String(getColumnValue(row, COLUMN_NAMES.PROPERTY_NAME) || '').trim()
                const ownerEmail = String(getColumnValue(row, COLUMN_NAMES.EMAIL) || '').trim().toLowerCase()
                const ownerName = String(getColumnValue(row, COLUMN_NAMES.OWNER_NAME) || '').trim()
                const ownerPhone = String(getColumnValue(row, COLUMN_NAMES.OWNER_CONTACT) || '').trim()
                const city = String(getColumnValue(row, COLUMN_NAMES.CITY) || '').trim()
                const area = String(getColumnValue(row, COLUMN_NAMES.AREA) || '').trim()

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
                if (!ownerPhone) {
                    errors.push(`Row ${rowNum}: Owner Contact is required`)
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

                // Parse property type and PG_FOR - using getColumnValue for backward compatibility
                const propertyTypeValue = String(getColumnValue(row, COLUMN_NAMES.PROPERTY_TYPE) || '')
                const pgFor = String(getColumnValue(row, COLUMN_NAMES.PG_FOR) || '')
                const oneRkPrice = parsePrice(getColumnValue(row, COLUMN_NAMES.ONE_RK))
                const privateRoomPrice = parsePrice(getColumnValue(row, COLUMN_NAMES.PRIVATE_ROOM))
                const doubleSharingPrice = parsePrice(getColumnValue(row, COLUMN_NAMES.DOUBLE_SHARING))
                const tripleSharingPrice = parsePrice(getColumnValue(row, COLUMN_NAMES.TRIPLE_SHARING))
                const fourSharingPrice = parsePrice(getColumnValue(row, COLUMN_NAMES.FOUR_SHARING))

                // At least one price should be present
                if (!oneRkPrice && !privateRoomPrice && !doubleSharingPrice && !tripleSharingPrice && !fourSharingPrice) {
                    errors.push(`Row ${rowNum}: At least one room price is required`)
                    continue
                }

                // Get optional fields with backward compatibility
                const landmark = String(getColumnValue(row, COLUMN_NAMES.LANDMARK) || '')
                const usp = String(getColumnValue(row, COLUMN_NAMES.USP) || '').replace(/^None$/i, '')
                const facilities = String(getColumnValue(row, COLUMN_NAMES.FACILITIES) || '')
                const locality = String(getColumnValue(row, COLUMN_NAMES.LOCALITY) || area)
                const address = String(getColumnValue(row, COLUMN_NAMES.ADDRESS) || `${propertyName}, ${area}`)
                const country = String(getColumnValue(row, COLUMN_NAMES.COUNTRY) || 'India')
                const deposit = parsePrice(getColumnValue(row, COLUMN_NAMES.DEPOSIT))

                // Build full address for Google Maps
                const fullAddress = `${propertyName}, ${area}, ${city}${landmark ? ', Near ' + landmark : ''}`
                const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`

                // Determine property type and preferred tenant
                const determinedPropertyType = getPropertyType(propertyTypeValue)
                const determinedPreferredTenant = getPreferredTenant(pgFor)

                // Build property data - matches normal property posting structure
                const propertyData = {
                    title: propertyName,
                    description: usp || landmark || `${propertyName} - ${determinedPreferredTenant} ${determinedPropertyType}`,
                    property_type: determinedPropertyType,
                    room_type: determineRoomType(row),

                    city: city,
                    area: area,
                    locality: locality,
                    address: address,
                    landmark: landmark,
                    google_maps_url: googleMapsUrl,

                    country: country,
                    owner_contact: ownerPhone,

                    one_rk_price: oneRkPrice,
                    private_room_price: privateRoomPrice,
                    double_sharing_price: doubleSharingPrice,
                    triple_sharing_price: tripleSharingPrice,
                    four_sharing_price: fourSharingPrice,
                    deposit: deposit,

                    amenities: mapAmenities(facilities),
                    preferred_tenant: determinedPreferredTenant,
                    usp: usp,

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
                    laundry: facilities.toLowerCase().includes('laundry') ||
                             facilities.toLowerCase().includes('washing'),
                    room_cleaning: facilities.toLowerCase().includes('house keeping') ||
                                   facilities.toLowerCase().includes('housekeeping') ||
                                   facilities.toLowerCase().includes('cleaning'),
                    warden: facilities.toLowerCase().includes('warden'),
                    parking: facilities.toLowerCase().includes('parking') ? 'Bike' : 'None',
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
                new_owners: newOwners.map(o => {
                    // Require AES-256-GCM encryption for passwords
                    if (!isEncryptionConfigured()) {
                        throw new Error('CREDENTIALS_ENCRYPTION_KEY not configured. Password encryption is required for bulk import.')
                    }

                    let encryptedPassword: string
                    try {
                        encryptedPassword = encrypt(o.password)
                    } catch (e: any) {
                        console.error('Password encryption failed:', e)
                        throw new Error(`Failed to encrypt password for ${o.email}: ${e.message}`)
                    }

                    return {
                        email: o.email,
                        name: o.name,
                        phone: o.phone,
                        password_encrypted: encryptedPassword,
                        properties: o.properties,
                    }
                }),
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
            .eq("id", jobId)

        return NextResponse.json(
            { error: error.message || "Failed to process Excel file" },
            { status: 500 }
        )
    }
}
