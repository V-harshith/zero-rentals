/**
 * Excel file templates for bulk import testing
 * These are binary representations of minimal Excel files
 */

import * as XLSX from 'xlsx'

export interface PropertyRow {
  PSN: string | number
  'Property Name': string
  Email: string
  'Owner Name': string
  'Owner Contact': string
  City: string
  Area: string
  'Property Type'?: string
  "PG's for"?: string
  'Private Room'?: number
  'Double Sharing'?: number
  'Triple Sharing'?: number
  'Four Sharing'?: number
  '1RK'?: number
  Deposit?: number
  Facilities?: string
  USP?: string
  Landmark?: string
}

/**
 * Generate a valid PG property row
 */
export function generatePGRow(index: number): PropertyRow {
  return {
    PSN: 1000 + index,
    'Property Name': `Test PG Property ${index}`,
    Email: `testowner${index}@example.com`,
    'Owner Name': `Test Owner ${index}`,
    'Owner Contact': `987654${index.toString().padStart(4, '0')}`,
    City: 'Bangalore',
    Area: 'Koramangala',
    'Property Type': 'PG',
    "PG's for": 'Male',
    'Private Room': 8000,
    'Double Sharing': 6000,
    'Triple Sharing': 5000,
    Deposit: 10000,
    Facilities: 'WiFi, Meals, AC, Parking',
    USP: 'Near metro station',
    Landmark: 'Forum Mall',
  }
}

/**
 * Generate a Co-living property row
 */
export function generateCoLivingRow(index: number): PropertyRow {
  return {
    PSN: 2000 + index,
    'Property Name': `Test Co-living Property ${index}`,
    Email: `colivingowner${index}@example.com`,
    'Owner Name': `Co-living Owner ${index}`,
    'Owner Contact': `987655${index.toString().padStart(4, '0')}`,
    City: 'Bangalore',
    Area: 'HSR Layout',
    'Property Type': 'Co-living',
    "PG's for": 'Couple', // Should be overridden by property type
    'Private Room': 12000,
    'Double Sharing': 9000,
    Deposit: 15000,
    Facilities: 'WiFi, Gym, AC, Power Backup',
    USP: 'Premium co-living space',
    Landmark: 'HSR BDA Complex',
  }
}

/**
 * Generate a Rent property row
 */
export function generateRentRow(index: number): PropertyRow {
  return {
    PSN: 3000 + index,
    'Property Name': `Test Rent Property ${index}`,
    Email: `rentowner${index}@example.com`,
    'Owner Name': `Rent Owner ${index}`,
    'Owner Contact': `987656${index.toString().padStart(4, '0')}`,
    City: 'Bangalore',
    Area: 'Indiranagar',
    'Property Type': 'Rent',
    '1RK': 15000,
    'Private Room': 25000,
    Deposit: 50000,
    Facilities: 'Fridge, TV, Geyser',
    USP: 'Fully furnished 1BHK',
    Landmark: '100 Feet Road',
  }
}

/**
 * Generate an invalid property row (missing required fields)
 */
export function generateInvalidRow(index: number): Partial<PropertyRow> {
  return {
    PSN: 4000 + index,
    'Property Name': `Invalid Property ${index}`,
    // Missing Email, Owner Name, Owner Contact, City, Area
  }
}

/**
 * Generate a row with invalid email
 */
export function generateInvalidEmailRow(index: number): PropertyRow {
  return {
    ...generatePGRow(index),
    PSN: 5000 + index,
    Email: 'invalid-email-format',
  }
}

/**
 * Generate a row with phone number as email (should fail)
 */
export function generatePhoneAsEmailRow(index: number): PropertyRow {
  return {
    ...generatePGRow(index),
    PSN: 6000 + index,
    Email: '9876543210@example.com',
  }
}

/**
 * Generate a row with no pricing (should fail)
 */
export function generateNoPricingRow(index: number): PropertyRow {
  return {
    ...generatePGRow(index),
    PSN: 7000 + index,
    'Private Room': undefined,
    'Double Sharing': undefined,
    'Triple Sharing': undefined,
    'Four Sharing': undefined,
    '1RK': undefined,
  }
}

/**
 * Generate a row with duplicate PSN
 */
export function generateDuplicatePSNRow(psn: number): PropertyRow {
  return {
    ...generatePGRow(0),
    PSN: psn,
  }
}

/**
 * Create an Excel workbook buffer from property rows
 */
export function createExcelBuffer(rows: PropertyRow[]): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Properties')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

/**
 * Create Excel with mixed property types
 */
export function createMixedPropertyTypesExcel(): Buffer {
  const rows: PropertyRow[] = [
    generatePGRow(1),
    generateCoLivingRow(1),
    generateRentRow(1),
    generatePGRow(2),
    generateCoLivingRow(2),
  ]
  return createExcelBuffer(rows)
}

/**
 * Create Excel with all valid PG properties
 */
export function createValidPGExcel(count: number = 3): Buffer {
  const rows: PropertyRow[] = Array.from({ length: count }, (_, i) => generatePGRow(i + 1))
  return createExcelBuffer(rows)
}

/**
 * Create Excel with validation errors
 */
export function createInvalidExcel(): Buffer {
  const rows: PropertyRow[] = [
    generatePGRow(1),
    generateInvalidEmailRow(2) as PropertyRow,
    generateNoPricingRow(3) as PropertyRow,
    generatePGRow(4),
  ]
  return createExcelBuffer(rows)
}

/**
 * Create Excel with duplicate PSN
 */
export function createDuplicatePSNExcel(): Buffer {
  const rows: PropertyRow[] = [
    generatePGRow(1),
    generateDuplicatePSNRow(1001), // Same PSN as first row
    generatePGRow(2),
  ]
  return createExcelBuffer(rows)
}

/**
 * Create Excel with old column format (for backward compatibility)
 */
export function createOldFormatExcel(): Buffer {
  const rows = [
    {
      psn: 8001,
      title: 'Old Format Property',
      email: 'oldformat@example.com',
      owner_name: 'Old Format Owner',
      owner_contact: '9876543210',
      city: 'Bangalore',
      area: 'Whitefield',
      type: 'PG',
      pg_for: 'Female',
      private_room_price: 7000,
      double_sharing_price: 5500,
      triple_sharing_price: 4500,
    }
  ]
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Properties')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

/**
 * Create Excel with TrippleSharing typo (backward compatibility)
 */
export function createTrippleSharingExcel(): Buffer {
  const rows = [
    {
      PSN: 9001,
      'Property Name': 'Tripple Sharing Test',
      Email: 'tripple@example.com',
      'Owner Name': 'Tripple Owner',
      'Owner Contact': '9876543210',
      City: 'Bangalore',
      Area: 'Marathahalli',
      'Property Type': 'PG',
      "PG's for": 'Male',
      'TrippleSharing': 4000, // Typo column
    }
  ]
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Properties')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}
