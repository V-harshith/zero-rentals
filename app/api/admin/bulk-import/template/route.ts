import { NextResponse } from "next/server"
import * as XLSX from "xlsx"

// ============================================================================
// GET /api/admin/bulk-import/template
// Download Excel template for bulk import
// ============================================================================
export async function GET() {
    try {
        // Define template headers
        const headers = [
            "PSN",                    // Unique Property Serial Number (required)
            "Property Name",          // Property name/title (required)
            "Email",                  // Owner email address (required)
            "Owner Name",             // Owner full name (required)
            "Owner Contact",          // Owner phone number (required)
            "City",                   // City (required)
            "Area",                   // Area/Locality (required)
            "Locality",               // Specific locality (optional)
            "Address",                // Full address (optional)
            "Landmark",               // Nearby landmark (optional)
            "Country",                // Country (optional, defaults to India)
            "PG's for",               // Target: Male/Female/Any (optional)
            "Private Room",           // Price for private room (optional)
            "Double Sharing",         // Price for double sharing (optional)
            "Triple Sharing",         // Price for triple sharing (optional)
            "Four Sharing",           // Price for four sharing (optional)
            "Deposit",                // Security deposit amount (optional)
            "Facilities",             // Comma-separated amenities (optional)
            "USP",                    // Unique selling points (optional)
        ]

        // Sample data row showing correct format
        const sampleRow = {
            "PSN": "PSN001",
            "Property Name": "Sunrise PG for Gents",
            "Email": "owner@example.com",
            "Owner Name": "John Doe",
            "Owner Contact": "9876543210",
            "City": "Bangalore",
            "Area": "Koramangala",
            "Locality": "5th Block",
            "Address": "123, 4th Cross, 5th Block, Koramangala",
            "Landmark": "Near Sony World Signal",
            "Country": "India",
            "PG's for": "Gents/Male",
            "Private Room": 8000,
            "Double Sharing": 6000,
            "Triple Sharing": 4500,
            "Four Sharing": 3500,
            "Deposit": 15000,
            "Facilities": "WiFi, AC, Food, Laundry, Parking, CCTV, Power Backup",
            "USP": "Homely food, 24/7 security, High speed internet",
        }

        // Create workbook
        const wb = XLSX.utils.book_new()

        // Create instruction sheet
        const instructionsData = [
            ["BULK IMPORT TEMPLATE - INSTRUCTIONS"],
            [],
            ["REQUIRED COLUMNS (Must be filled):"],
            ["• PSN", "Unique Property Serial Number (e.g., PSN001, PSN002)"],
            ["• Property Name", "Name of the property as it will appear on the site"],
            ["• Email", "Valid owner email address (required for account creation)"],
            ["• Owner Name", "Full name of the property owner"],
            ["• Owner Contact", "Phone number with country code (e.g., 9876543210)"],
            ["• City", "City name (e.g., Bangalore, Hyderabad)"],
            ["• Area", "Area/Locality name (e.g., Koramangala, Hitech City)"],
            [],
            ["OPTIONAL COLUMNS:"],
            ["• Locality", "Specific locality within the area"],
            ["• Address", "Complete street address"],
            ["• Landmark", "Nearby landmark for easy location"],
            ["• Country", "Defaults to 'India' if not provided"],
            ["• PG's for", "Target audience: Male, Female, Gents, Ladies, Boys, Girls, or Any"],
            ["• Private Room", "Monthly rent for private room (numbers only)"],
            ["• Double Sharing", "Monthly rent for double sharing (numbers only)"],
            ["• Triple Sharing", "Monthly rent for triple sharing (numbers only)"],
            ["• Four Sharing", "Monthly rent for four sharing (numbers only)"],
            ["• Deposit", "Security deposit amount (numbers only)"],
            ["• Facilities", "Comma-separated amenities list"],
            ["• USP", "Unique selling points or special features"],
            [],
            ["FACILITIES - Available Options (use comma-separated values):"],
            ["• WiFi / Wi-Fi / Internet", "• AC / Air Conditioning"],
            ["• Food / Meals / Tiffin", "• Laundry / Washing Machine"],
            ["• Cleaning / House Keeping / Housekeeping", "• Security / CCTV / Security Guard"],
            ["• Parking / Bike Parking / Car Parking", "• Power Backup / Generator / Inverter"],
            ["• Geyser / Water Heater / Hot Water", "• Gym"],
            ["• TV / Television", "• Fridge / Refrigerator"],
            ["• Water Purifier / RO Water / RO", ""],
            [],
            ["IMPORTANT NOTES:"],
            ["1. PSN must be unique across all imports"],
            ["2. Email must be a valid email format (not phone numbers)"],
            ["3. At least one room price is required (Private, Double, Triple, or Four Sharing)"],
            ["4. Multiple properties can have the same owner (same email)"],
            ["5. New owners will receive login credentials via email"],
            ["6. Maximum 1000 properties per import"],
            ["7. After Excel upload, you'll need to upload property images in a ZIP file"],
            ["8. Images should be named with PSN (e.g., PSN001_1.jpg, PSN001_2.jpg)"],
            [],
            ["EXAMPLE FACILITIES FORMAT:"],
            ["WiFi, AC, Food, Laundry, Parking, CCTV, Power Backup, Geyser"],
            [],
            ["EXAMPLE PG'S FOR VALUES:"],
            ["• Gents / Male / Boys → Shows as Male property"],
            ["• Ladies / Female / Girls → Shows as Female property"],
            ["• Any / Co-living / Rent → Shows as Any"],
        ]

        const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData)
        XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions")

        // Create data sheet with headers and sample
        const dataRows = [headers, sampleRow]
        const wsData = XLSX.utils.json_to_sheet(dataRows, { skipHeader: true })

        // Set column widths for better readability
        const colWidths = [
            { wch: 10 },  // PSN
            { wch: 30 },  // Property Name
            { wch: 25 },  // Email
            { wch: 20 },  // Owner Name
            { wch: 15 },  // Owner Contact
            { wch: 15 },  // City
            { wch: 20 },  // Area
            { wch: 20 },  // Locality
            { wch: 35 },  // Address
            { wch: 25 },  // Landmark
            { wch: 12 },  // Country
            { wch: 15 },  // PG's for
            { wch: 14 },  // Private Room
            { wch: 16 },  // Double Sharing
            { wch: 16 },  // Triple Sharing
            { wch: 14 },  // Four Sharing
            { wch: 10 },  // Deposit
            { wch: 50 },  // Facilities
            { wch: 40 },  // USP
        ]
        wsData['!cols'] = colWidths

        XLSX.utils.book_append_sheet(wb, wsData, "Properties")

        // Generate buffer
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

        // Return as downloadable file
        return new Response(buf, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': 'attachment; filename="zero-rentals-bulk-import-template.xlsx"',
            },
        })

    } catch (error: any) {
        console.error("Template generation error:", error)
        return NextResponse.json(
            { error: error.message || "Failed to generate template" },
            { status: 500 }
        )
    }
}
