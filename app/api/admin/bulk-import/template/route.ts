import { NextResponse } from "next/server"
import * as XLSX from "xlsx"

// ============================================================================
// GET /api/admin/bulk-import/template
// Download Excel template for bulk import
// ============================================================================
export async function GET() {
    try {
        // Define template headers (in exact order as per reference format)
        const headers = [
            "Country",                // Country (optional, defaults to India)
            "City",                   // City (required)
            "Area",                   // Area/Locality (required)
            "Locality",               // Specific locality (optional)
            "Property Type",          // Property type: PG, Co-living, or Rent (required)
            "PG's for",               // Target: Male/Female/Any (optional)
            "Property Name",          // Property name/title (required)
            "Owner Name",             // Owner full name (required)
            "Owner Contact",          // Owner phone number (required)
            "Landmark",               // Nearby landmark (optional)
            "USP",                    // Unique selling points (optional)
            "Facilities",             // Comma-separated amenities (optional)
            "Private Room",           // Price for private room (optional)
            "Double Sharing",         // Price for double sharing (optional)
            "Triple Sharing",         // Price for triple sharing (optional)
            "Four Sharing",           // Price for four sharing (optional)
            "Deposit",                // Security deposit amount (optional)
            "Address",                // Full address (optional)
            "PSN",                    // Unique Property Serial Number (required)
            "Email",                  // Owner email address (required)
            "1RK",                    // Price for 1RK (optional)
        ]

        // Sample data row showing correct format (matching new column order)
        const sampleRow = {
            "Country": "India",
            "City": "Bangalore",
            "Area": "Koramangala",
            "Locality": "5th Block",
            "Property Type": "PG",
            "PG's for": "Gents/Male",
            "Property Name": "Sunrise PG for Gents",
            "Owner Name": "John Doe",
            "Owner Contact": "9876543210",
            "Landmark": "Near Sony World Signal",
            "USP": "Homely food, 24/7 security, High speed internet",
            "Facilities": "WiFi, AC, Food, Laundry, Parking, CCTV, Power Backup",
            "Private Room": 8000,
            "Double Sharing": 6000,
            "Triple Sharing": 4500,
            "Four Sharing": 3500,
            "Deposit": 15000,
            "Address": "123, 4th Cross, 5th Block, Koramangala",
            "PSN": "PSN001",
            "Email": "owner@example.com",
            "1RK": 9000,
        }

        // Create workbook
        const wb = XLSX.utils.book_new()

        // Create instruction sheet
        const instructionsData = [
            ["BULK IMPORT TEMPLATE - INSTRUCTIONS"],
            [],
            ["COLUMN ORDER (must match exactly):"],
            ["1. Country", "Defaults to 'India' if not provided"],
            ["2. City", "City name (e.g., Bangalore, Hyderabad) - REQUIRED"],
            ["3. Area", "Area/Locality name (e.g., Koramangala, Hitech City) - REQUIRED"],
            ["4. Locality", "Specific locality within the area"],
            ["5. Property Type", "Property type: PG, Co-living, or Rent - REQUIRED"],
            ["6. PG's for", "Target audience: Male, Female, Gents, Ladies, Boys, Girls, or Any"],
            ["7. Property Name", "Name of the property as it will appear on the site - REQUIRED"],
            ["8. Owner Name", "Full name of the property owner - REQUIRED"],
            ["9. Owner Contact", "Phone number with country code (e.g., 9876543210) - REQUIRED"],
            ["10. Landmark", "Nearby landmark for easy location"],
            ["11. USP", "Unique selling points or special features"],
            ["12. Facilities", "Comma-separated amenities list"],
            ["13. Private Room", "Monthly rent for private room (numbers only)"],
            ["14. Double Sharing", "Monthly rent for double sharing (numbers only)"],
            ["15. Triple Sharing", "Monthly rent for triple sharing (numbers only)"],
            ["16. Four Sharing", "Monthly rent for four sharing (numbers only)"],
            ["17. Deposit", "Security deposit amount (numbers only)"],
            ["18. Address", "Complete street address"],
            ["19. PSN", "Unique Property Serial Number (e.g., PSN001, PSN002) - REQUIRED"],
            ["20. Email", "Valid owner email address (required for account creation) - REQUIRED"],
            ["21. 1RK", "Monthly rent for 1RK (numbers only)"],
            [],
            ["REQUIRED COLUMNS (Must be filled):"],
            ["• City, Area, Property Type, Property Name, Owner Name, Owner Contact, PSN, Email"],
            [],
            ["OPTIONAL COLUMNS:"],
            ["• Country, Locality, PG's for, Landmark, USP, Facilities"],
            ["• Private Room, Double Sharing, Triple Sharing, Four Sharing, 1RK"],
            ["• Deposit, Address"],
            [],
            ["PROPERTY TYPE - Valid Values (exact spelling):"],
            ["• PG", "Paying Guest accommodation"],
            ["• Co-living", "Co-living space"],
            ["• Rent", "Rental property / Apartment"],
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
            ["3. At least one room price is required (Private, Double, Triple, Four Sharing, or 1RK)"],
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

        // Set column widths for better readability (matching new column order)
        const colWidths = [
            { wch: 12 },  // Country
            { wch: 15 },  // City
            { wch: 20 },  // Area
            { wch: 20 },  // Locality
            { wch: 15 },  // Property Type
            { wch: 15 },  // PG's for
            { wch: 30 },  // Property Name
            { wch: 20 },  // Owner Name
            { wch: 15 },  // Owner Contact
            { wch: 25 },  // Landmark
            { wch: 40 },  // USP
            { wch: 50 },  // Facilities
            { wch: 14 },  // Private Room
            { wch: 16 },  // Double Sharing
            { wch: 16 },  // Triple Sharing
            { wch: 14 },  // Four Sharing
            { wch: 10 },  // Deposit
            { wch: 35 },  // Address
            { wch: 10 },  // PSN
            { wch: 25 },  // Email
            { wch: 10 },  // 1RK
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
