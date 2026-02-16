import { NextRequest } from "next/server"
import * as XLSX from "xlsx"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import crypto from "crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 minutes for Vercel

// Increase body size limit for Excel file uploads (prevents 413 Payload Too Large)
export const bodyParser = {
  sizeLimit: '10mb',
}

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
        // Check direct mapping
        if (AMENITY_MAP[facility]) {
            mapped.add(AMENITY_MAP[facility])
            continue
        }
        // Check partial matching
        for (const [key, value] of Object.entries(AMENITY_MAP)) {
            if (facility.includes(key) || key.includes(facility)) {
                mapped.add(value)
                break
            }
        }
    }

    return Array.from(mapped)
}

// ============================================================================
// HELPERS
// ============================================================================
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

function generatePassword(): string {
    return crypto.randomBytes(8).toString('base64url').slice(0, 12) + '!A1'
}

function determineRoomType(row: Record<string, unknown>): string {
    if (parsePrice(row['1RK'])) return '1RK'
    if (parsePrice(row['Private Room'])) return 'Single'
    if (parsePrice(row['Double Sharing'])) return 'Double'
    if (parsePrice(row['Triple Sharing']) || parsePrice(row['TrippleSharing'])) return 'Triple'
    if (parsePrice(row['Four Sharing'])) return 'Four Sharing'
    return 'Single'
}

function getLowestPrice(row: Record<string, unknown>): number | null {
    const prices = [
        parsePrice(row['1RK']),
        parsePrice(row['Private Room']),
        parsePrice(row['Double Sharing']),
        parsePrice(row['Triple Sharing']) || parsePrice(row['TrippleSharing']),
        parsePrice(row['Four Sharing']),
    ].filter((p): p is number => p !== null)

    return prices.length > 0 ? Math.min(...prices) : null
}

// Owner cache to avoid duplicate lookups/creations per upload
interface OwnerCredentials {
    email: string
    password: string
    name: string
    phone: string
    propertyNames: string[]
    isNew: boolean
}

// ============================================================================
// MAIN API HANDLER
// ============================================================================
export async function POST(request: NextRequest) {
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: Record<string, unknown>) => {
                controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))
            }

            try {
                // 1. AUTH CHECK — verify the user is admin
                const supabase = await createClient()
                const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

                if (authError || !authUser) {
                    send({ error: 'Unauthorized: Please log in as admin' })
                    controller.close()
                    return
                }

                const { data: profile } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', authUser.id)
                    .maybeSingle()

                if (!profile || profile.role !== 'admin') {
                    send({ error: 'Unauthorized: Admin access required' })
                    controller.close()
                    return
                }

                // 2. PARSE EXCEL
                const formData = await request.formData()
                const file = formData.get('file') as File

                if (!file) {
                    send({ error: 'No file provided' })
                    controller.close()
                    return
                }

                send({ status: 'Parsing Excel file...' })

                const buffer = await file.arrayBuffer()
                const workbook = XLSX.read(buffer, { type: 'array' })
                const sheetName = workbook.SheetNames[0]
                const worksheet = workbook.Sheets[sheetName]
                const data = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[]

                if (data.length === 0) {
                    send({ error: 'Excel file is empty' })
                    controller.close()
                    return
                }

                const total = data.length
                let success = 0
                let failed = 0
                const errors: string[] = []
                const credentials: OwnerCredentials[] = []

                // Owner lookup cache: email -> user id
                const ownerCache = new Map<string, { id: string; name: string; phone: string }>()

                // 2b. CREATE BULK UPLOAD TRACKING RECORD
                let uploadId: string | null = null
                try {
                    const { data: uploadRecord } = await supabaseAdmin
                        .from('bulk_uploads')
                        .insert({
                            admin_id: authUser.id,
                            file_name: file.name,
                            total_rows: total,
                            status: 'processing',
                        })
                        .select('id')
                        .single()
                    uploadId = uploadRecord?.id || null
                } catch {
                    // Non-fatal: tracking is optional
                }

                send({ status: `Processing ${total} properties...`, total, uploadId })

                // 3. BATCH PROCESSING
                const BATCH_SIZE = 50
                const totalBatches = Math.ceil(total / BATCH_SIZE)

                for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
                    const start = batchIdx * BATCH_SIZE
                    const end = Math.min(start + BATCH_SIZE, total)
                    const batch = data.slice(start, end)

                    send({
                        status: `Processing batch ${batchIdx + 1}/${totalBatches}...`,
                        currentBatch: batchIdx + 1,
                        totalBatches,
                    })

                    for (let i = 0; i < batch.length; i++) {
                        const rowIndex = start + i
                        const row = batch[i]

                        try {
                            // --- OWNER HANDLING ---
                            const ownerEmail = String(row['Email'] || '').trim().toLowerCase()
                            const ownerName = String(row['Owner Name'] || 'Unknown Owner').trim()
                            const ownerPhone = String(row['Owner Contact'] || '').trim()
                            let ownerId: string | null = null

                            if (ownerEmail && ownerEmail.includes('@')) {
                                // Check cache first
                                const cached = ownerCache.get(ownerEmail)
                                if (cached) {
                                    ownerId = cached.id
                                } else {
                                    // Check if owner exists in DB
                                    const { data: existingUser } = await supabaseAdmin
                                        .from('users')
                                        .select('id, name, phone')
                                        .eq('email', ownerEmail)
                                        .maybeSingle()

                                    if (existingUser) {
                                        ownerId = existingUser.id
                                        ownerCache.set(ownerEmail, {
                                            id: existingUser.id,
                                            name: existingUser.name || ownerName,
                                            phone: existingUser.phone || ownerPhone
                                        })
                                    } else {
                                        // Create new owner account via Supabase Auth
                                        const password = generatePassword()
                                        const { data: authData, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
                                            email: ownerEmail,
                                            password: password,
                                            email_confirm: true,
                                            user_metadata: {
                                                name: ownerName,
                                                phone: ownerPhone,
                                                role: 'owner'
                                            }
                                        })

                                        if (authCreateError || !authData.user) {
                                            // If user already exists in auth but not users table, try to find them
                                            if (authCreateError?.message?.includes('already exists')) {
                                                const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
                                                const existingAuthUser = users?.find(u => u.email === ownerEmail)
                                                if (existingAuthUser) {
                                                    ownerId = existingAuthUser.id
                                                    // Ensure users table row exists
                                                    await supabaseAdmin.from('users').upsert({
                                                        id: existingAuthUser.id,
                                                        email: ownerEmail,
                                                        name: ownerName,
                                                        phone: ownerPhone,
                                                        role: 'owner',
                                                        verified: true,
                                                email_verified_at: existingAuthUser.email_confirmed_at || new Date().toISOString(),
                                                    }, { onConflict: 'id' })

                                                    ownerCache.set(ownerEmail, { id: existingAuthUser.id, name: ownerName, phone: ownerPhone })
                                                } else {
                                                    throw new Error(`Owner auth issue: ${authCreateError.message}`)
                                                }
                                            } else {
                                                throw new Error(`Failed to create owner: ${authCreateError?.message}`)
                                            }
                                        } else {
                                            ownerId = authData.user.id

                                            // Insert into users table
                                            await supabaseAdmin.from('users').upsert({
                                                id: authData.user.id,
                                                email: ownerEmail,
                                                name: ownerName,
                                                phone: ownerPhone,
                                                role: 'owner',
                                                verified: true,
                                                email_verified_at: new Date().toISOString(),
                                            }, { onConflict: 'id' })

                                            ownerCache.set(ownerEmail, { id: authData.user.id, name: ownerName, phone: ownerPhone })

                                            // Track credentials
                                            const existingCred = credentials.find(c => c.email === ownerEmail)
                                            if (existingCred) {
                                                existingCred.propertyNames.push(String(row['Property Name'] || 'Unknown'))
                                            } else {
                                                credentials.push({
                                                    email: ownerEmail,
                                                    password: password,
                                                    name: ownerName,
                                                    phone: ownerPhone,
                                                    propertyNames: [String(row['Property Name'] || 'Unknown')],
                                                    isNew: true,
                                                })
                                            }
                                        }
                                    }
                                }
                            }

                            // --- BUILD PROPERTY DATA ---
                            const pgFor = String(row["PG's for"] || row["PG's For"] || '')
                            const propertyName = String(row['Property Name'] || `PG in ${row['Area'] || 'Unknown'}`)

                            const property: Record<string, unknown> = {
                                title: propertyName,
                                description: String(row['USP'] || row['Landmark'] || '').replace(/^None$/i, '') || `${propertyName} - ${getPreferredTenant(pgFor)} PG`,
                                property_type: getPropertyType(pgFor),
                                room_type: determineRoomType(row),

                                city: String(row['City'] || 'Unknown'),
                                area: String(row['Area'] || 'Unknown'),
                                locality: String(row['Locality'] || ''),
                                address: String(row['Address'] || row['Landmark'] || ''),

                                owner_id: ownerId,
                                owner_name: ownerName,
                                owner_contact: ownerPhone,

                                one_rk_price: parsePrice(row['1RK']),
                                private_room_price: parsePrice(row['Private Room']),
                                double_sharing_price: parsePrice(row['Double Sharing']),
                                triple_sharing_price: parsePrice(row['Triple Sharing']) || parsePrice(row['TrippleSharing']),
                                four_sharing_price: parsePrice(row['Four Sharing']),
                                deposit: parsePrice(row['Deposit']),

                                amenities: mapAmenities(String(row['Facilities'] || '')),
                                preferred_tenant: getPreferredTenant(pgFor),

                                status: 'active',
                                availability: 'Available',
                                featured: false,
                                verified: false,
                                views: 0,
                                source: 'excel_import',
                                psn: row['PSN'] ? String(row['PSN']) : null,
                            }

                            // Insert via admin client (bypasses RLS)
                            const { error: insertError } = await supabaseAdmin
                                .from('properties')
                                .insert([property])

                            if (insertError) {
                                throw new Error(insertError.message)
                            }

                            success++
                        } catch (error: unknown) {
                            failed++
                            const msg = error instanceof Error ? error.message : String(error)
                            // Categorize errors
                            let category = 'PROPERTY'
                            if (msg.includes('Owner') || msg.includes('owner') || msg.includes('create user')) {
                                category = 'OWNER'
                            } else if (msg.includes('price') || msg.includes('Price')) {
                                category = 'PRICE'
                            } else if (msg.includes('duplicate') || msg.includes('unique')) {
                                category = 'DUPLICATE'
                            }
                            errors.push(`[${category}] Row ${rowIndex + 2}: ${msg}`)
                        }
                    }

                    // Send progress after each batch
                    const progress = Math.round((end / total) * 100)
                    send({
                        progress,
                        processed: end,
                        total,
                        success,
                        failed,
                    })

                    // Persist progress to DB after each batch
                    if (uploadId) {
                        try {
                            await supabaseAdmin
                                .from('bulk_uploads')
                                .update({
                                    success_count: success,
                                    failed_count: failed,
                                    metadata: { last_batch: batchIdx + 1, total_batches: totalBatches },
                                })
                                .eq('id', uploadId)

                            // Check if cancelled
                            const { data: uploadStatus } = await supabaseAdmin
                                .from('bulk_uploads')
                                .select('status')
                                .eq('id', uploadId)
                                .single()

                            if (uploadStatus?.status === 'cancelled') {
                                send({
                                    results: {
                                        total,
                                        success,
                                        failed,
                                        errors: errors.slice(0, 200),
                                        cancelled: true,
                                    },
                                    credentials: credentials.map(c => ({
                                        email: c.email,
                                        password: c.password,
                                        name: c.name,
                                        phone: c.phone,
                                        properties: c.propertyNames,
                                        isNew: c.isNew,
                                    })),
                                    uploadId,
                                })
                                controller.close()
                                return
                            }
                        } catch {
                            // Non-fatal
                        }
                    }
                }

                // 4. UPDATE TRACKING RECORD
                if (uploadId) {
                    try {
                        await supabaseAdmin
                            .from('bulk_uploads')
                            .update({
                                success_count: success,
                                failed_count: failed,
                                status: failed === total ? 'failed' : 'completed',
                                errors: errors.slice(0, 200),
                                credentials: credentials.map(c => ({
                                    email: c.email,
                                    password: c.password,
                                    name: c.name,
                                    phone: c.phone,
                                    properties: c.propertyNames,
                                })),
                                new_owners_count: credentials.length,
                                completed_at: new Date().toISOString(),
                            })
                            .eq('id', uploadId)
                    } catch {
                        // Non-fatal
                    }
                }

                // 5. SEND FINAL RESULTS
                send({
                    results: {
                        total,
                        success,
                        failed,
                        errors: errors.slice(0, 200),
                    },
                    credentials: credentials.map(c => ({
                        email: c.email,
                        password: c.password,
                        name: c.name,
                        phone: c.phone,
                        properties: c.propertyNames,
                        isNew: c.isNew,
                    })),
                    uploadId,
                })

                controller.close()
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : 'Unknown error'
                send({ error: msg })
                controller.close()
            }
        }
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    })
}
