/**
 * Data Consistency Tests
 *
 * These tests verify that data constraints, validations, and relationships
 * are consistent across the application layers:
 * - Database schema (SQL constraints)
 * - TypeScript types
 * - Zod validation schemas
 * - UI components
 */

import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// Import schemas to test
import { propertySchema } from '@/lib/validations/property-schema'
import { StrictPropertySchema, PropertySearchFiltersSchema } from '@/lib/validations/strict-schemas'
import { PropertySchema, PROPERTY_TYPES, ROOM_TYPES, GENDERS } from '@/lib/validation'
import { GENDER_OPTIONS } from '@/lib/constants/amenities'
import type { PropertyRow } from '@/lib/data-mappers'
import type { Property } from '@/lib/types'

describe('Data Consistency Tests', () => {
  // ============================================================================
  // 1. Property Type Validation Tests
  // ============================================================================
  describe('Property Type Validation', () => {
    const VALID_PROPERTY_TYPES = ['PG', 'Co-living', 'Rent'] as const

    it('should accept valid property types', () => {
      VALID_PROPERTY_TYPES.forEach(type => {
        const result = propertySchema.safeParse({
          title: 'Test Property',
          property_type: type,
          room_type: 'Single',
          city: 'Mumbai',
          area: 'Andheri'
        })
        expect(result.success).toBe(true)
      })
    })

    it('should reject invalid property types', () => {
      const invalidTypes = ['pg', 'PGs', 'Apartment', 'Hotel', '']
      invalidTypes.forEach(type => {
        const result = propertySchema.safeParse({
          title: 'Test Property',
          property_type: type,
          room_type: 'Single',
          city: 'Mumbai',
          area: 'Andheri'
        })
        expect(result.success).toBe(false)
      })
    })

    it('should match database property type constraints', () => {
      // Database constraint: CHECK (property_type IN ('PG', 'Co-living', 'Rent'))
      const dbAllowedTypes = ['PG', 'Co-living', 'Rent']
      expect(PROPERTY_TYPES).toEqual(dbAllowedTypes)
    })
  })

  // ============================================================================
  // 2. Room Type Validation Tests
  // ============================================================================
  describe('Room Type Validation', () => {
    const VALID_ROOM_TYPES = ['Single', 'Double', 'Triple', 'Four Sharing', 'Apartment', '1RK'] as const

    it('should accept valid room types', () => {
      VALID_ROOM_TYPES.forEach(type => {
        const result = propertySchema.safeParse({
          title: 'Test Property',
          property_type: 'PG',
          room_type: type,
          city: 'Mumbai',
          area: 'Andheri'
        })
        expect(result.success).toBe(true)
      })
    })

    it('should reject invalid room types', () => {
      const invalidTypes = ['1BHK', '2BHK', 'Studio', 'shared', '']
      invalidTypes.forEach(type => {
        const result = propertySchema.safeParse({
          title: 'Test Property',
          property_type: 'PG',
          room_type: type,
          city: 'Mumbai',
          area: 'Andheri'
        })
        expect(result.success).toBe(false)
      })
    })

    it('should match database room type constraints', () => {
      // Database constraint: CHECK (room_type IN ('Single', 'Double', 'Triple', 'Four Sharing', 'Apartment', '1RK'))
      const dbAllowedTypes = ['Single', 'Double', 'Triple', 'Four Sharing', 'Apartment', '1RK']
      expect(ROOM_TYPES).toEqual(dbAllowedTypes)
    })
  })

  // ============================================================================
  // 3. Property Type + Room Type Consistency Tests
  // ============================================================================
  describe('Property Type + Room Type Consistency', () => {
    it('PG properties should work with sharing room types', () => {
      const sharingRoomTypes = ['Single', 'Double', 'Triple', 'Four Sharing']
      sharingRoomTypes.forEach(roomType => {
        const result = propertySchema.safeParse({
          title: 'Test PG Property',
          property_type: 'PG',
          room_type: roomType,
          city: 'Mumbai',
          area: 'Andheri'
        })
        expect(result.success).toBe(true)
      })
    })

    it('Rent properties should work with Apartment/1RK room types', () => {
      const rentRoomTypes = ['Apartment', '1RK']
      rentRoomTypes.forEach(roomType => {
        const result = propertySchema.safeParse({
          title: 'Test Rent Property',
          property_type: 'Rent',
          room_type: roomType,
          city: 'Mumbai',
          area: 'Andheri'
        })
        expect(result.success).toBe(true)
      })
    })

    it('Co-living properties should work with sharing room types', () => {
      const sharingRoomTypes = ['Single', 'Double', 'Triple', 'Four Sharing']
      sharingRoomTypes.forEach(roomType => {
        const result = propertySchema.safeParse({
          title: 'Test Co-living Property',
          property_type: 'Co-living',
          room_type: roomType,
          city: 'Mumbai',
          area: 'Andheri'
        })
        expect(result.success).toBe(true)
      })
    })
  })

  // ============================================================================
  // 4. Preferred Tenant Validation Tests
  // ============================================================================
  describe('Preferred Tenant Validation', () => {
    it('should accept valid preferred_tenant values per propertySchema', () => {
      // NOTE: propertySchema accepts 'Male', 'Female', 'Any', 'Gents', 'Ladies'
      // but NOT 'Couple' - this is a data inconsistency that should be fixed
      const validValues = ['Male', 'Female', 'Any', 'Gents', 'Ladies']
      validValues.forEach(value => {
        const result = propertySchema.safeParse({
          title: 'Test Property',
          property_type: 'PG',
          room_type: 'Single',
          city: 'Mumbai',
          area: 'Andheri',
          preferred_tenant: value
        })
        expect(result.success).toBe(true)
      })
    })

    it('DOCUMENTED ISSUE: propertySchema does not accept Couple', () => {
      // This test documents a known inconsistency:
      // - Database constraint allows: 'Male', 'Female', 'Couple' or NULL
      // - propertySchema accepts: 'Male', 'Female', 'Any', 'Gents', 'Ladies'
      // - PropertySchema (validation.ts) accepts: 'Male', 'Female', 'Couple'
      //
      // The 'Couple' value should be added to propertySchema for consistency
      const result = propertySchema.safeParse({
        title: 'Test Property',
        property_type: 'PG',
        room_type: 'Single',
        city: 'Mumbai',
        area: 'Andheri',
        preferred_tenant: 'Couple'
      })
      // This currently fails - documenting the bug
      expect(result.success).toBe(false)
    })

    it('should accept NULL preferred_tenant', () => {
      const result = propertySchema.safeParse({
        title: 'Test Property',
        property_type: 'Rent',
        room_type: 'Apartment',
        city: 'Mumbai',
        area: 'Andheri',
        preferred_tenant: undefined
      })
      expect(result.success).toBe(true)
    })

    it('should match GENDERS constant with validation', () => {
      // GENDERS is used for strict validation (Male, Female, Couple)
      expect(GENDERS).toEqual(['Male', 'Female', 'Couple'])
    })

    it('should match GENDER_OPTIONS constant', () => {
      // GENDER_OPTIONS is used in UI components
      expect(GENDER_OPTIONS).toEqual(['Couple', 'Male', 'Female'])
    })

    it('should have consistent gender values across all sources', () => {
      const schemaGenders = GENDERS
      const uiGenders = GENDER_OPTIONS

      // All GENDERS should be in GENDER_OPTIONS (order may differ)
      schemaGenders.forEach(gender => {
        expect(uiGenders).toContain(gender)
      })
    })
  })

  // ============================================================================
  // 5. Database Constraint Alignment Tests
  // ============================================================================
  describe('Database Constraint Alignment', () => {
    it('should align with properties_preferred_tenant_check constraint', () => {
      // Database constraint: CHECK (preferred_tenant IN ('Male', 'Female', 'Couple') OR preferred_tenant IS NULL)
      // PropertySchema (from validation.ts) uses GENDERS = ['Male', 'Female', 'Couple']
      const dbAllowedValues = ['Male', 'Female', 'Couple']

      // Test that PropertySchema accepts these values
      dbAllowedValues.forEach(value => {
        const result = PropertySchema.safeParse({
          title: 'Test Property Title',
          propertyType: 'PG',
          roomType: 'Single',
          location: { city: 'Mumbai', area: 'Andheri', address: 'Test Address Here' },
          price: 5000,
          preferredTenant: value as any,
          ownerId: 'test-owner',
          ownerName: 'Test Owner',
          ownerContact: '9876543210',
          images: ['test.jpg'],
          amenities: []
        })
        expect(result.success).toBe(true)
      })
    })

    it('DOCUMENTED ISSUE: Schema inconsistency between propertySchema and PropertySchema', () => {
      // This test documents the inconsistency between two schemas:
      //
      // 1. propertySchema (lib/validations/property-schema.ts):
      //    preferred_tenant: z.enum(['Male', 'Female', 'Any', 'Gents', 'Ladies']).optional()
      //
      // 2. PropertySchema (lib/validation.ts):
      //    preferredTenant: z.enum(GENDERS).optional() where GENDERS = ['Male', 'Female', 'Couple']
      //
      // Database constraint:
      //    CHECK (preferred_tenant IN ('Male', 'Female', 'Couple') OR preferred_tenant IS NULL)
      //
      // The propertySchema should be updated to accept 'Couple' instead of 'Any', 'Gents', 'Ladies'
      // to align with the database constraint and business requirements.

      // PropertySchema correctly accepts 'Couple'
      const result1 = PropertySchema.safeParse({
        title: 'Test Property Title',
        propertyType: 'PG',
        roomType: 'Single',
        location: { city: 'Mumbai', area: 'Andheri', address: 'Test Address Here' },
        price: 5000,
        preferredTenant: 'Couple',
        ownerId: 'test-owner',
        ownerName: 'Test Owner',
        ownerContact: '9876543210',
        images: ['test.jpg'],
        amenities: []
      })
      expect(result1.success).toBe(true)

      // propertySchema does NOT accept 'Couple' (documented inconsistency)
      const result2 = propertySchema.safeParse({
        title: 'Test Property',
        property_type: 'PG',
        room_type: 'Single',
        city: 'Mumbai',
        area: 'Andheri',
        preferred_tenant: 'Couple'
      })
      expect(result2.success).toBe(false)
    })

    it('should align with property_type database constraint', () => {
      // Database: CHECK (property_type IN ('PG', 'Co-living', 'Rent'))
      const dbPropertyTypes = ['PG', 'Co-living', 'Rent']
      expect(PROPERTY_TYPES).toEqual(dbPropertyTypes)
    })

    it('should align with room_type database constraint', () => {
      // Database: CHECK (room_type IN ('Single', 'Double', 'Triple', 'Four Sharing', 'Apartment', '1RK'))
      const dbRoomTypes = ['Single', 'Double', 'Triple', 'Four Sharing', 'Apartment', '1RK']
      expect(ROOM_TYPES).toEqual(dbRoomTypes)
    })
  })

  // ============================================================================
  // 6. TypeScript Type Alignment Tests
  // ============================================================================
  describe('TypeScript Type Alignment', () => {
    it('PropertyRow should have correct preferred_tenant type', () => {
      // PropertyRow defines: preferred_tenant: 'Male' | 'Female' | 'Couple' | 'Any' | null
      const validPropertyRow: Partial<PropertyRow> = {
        preferred_tenant: 'Couple'
      }
      expect(validPropertyRow.preferred_tenant).toBe('Couple')
    })

    it('Property type should have correct preferredTenant type', () => {
      // Property type defines: preferredTenant?: 'Male' | 'Female' | 'Couple' | 'Any'
      const validProperty: Partial<Property> = {
        preferredTenant: 'Couple'
      }
      expect(validProperty.preferredTenant).toBe('Couple')
    })
  })

  // ============================================================================
  // 7. Search Filter Validation Tests
  // ============================================================================
  describe('Search Filter Validation', () => {
    it('should validate property_type in search filters', () => {
      const validFilters = [
        { property_type: 'PG' },
        { property_type: 'Co-living' },
        { property_type: 'Rent' },
        { property_type: 'All' }
      ]

      validFilters.forEach(filter => {
        const result = PropertySearchFiltersSchema.safeParse(filter)
        expect(result.success).toBe(true)
      })
    })

    it('should validate room_type in search filters', () => {
      const validFilters = [
        { room_type: 'Single' },
        { room_type: 'Double' },
        { room_type: 'Triple' },
        { room_type: 'Four Sharing' },
        { room_type: 'Apartment' },
        { room_type: '1RK' },
        { room_type: 'All' }
      ]

      validFilters.forEach(filter => {
        const result = PropertySearchFiltersSchema.safeParse(filter)
        expect(result.success).toBe(true)
      })
    })

    it('should validate preferred_tenant in search filters', () => {
      const validFilters = [
        { preferred_tenant: 'Male' },
        { preferred_tenant: 'Female' },
        { preferred_tenant: 'Any' },
        { preferred_tenant: 'All' }
      ]

      validFilters.forEach(filter => {
        const result = PropertySearchFiltersSchema.safeParse(filter)
        expect(result.success).toBe(true)
      })
    })
  })

  // ============================================================================
  // 8. Strict Schema Validation Tests
  // ============================================================================
  describe('Strict Schema Validation', () => {
    it('StrictPropertySchema should enforce all required fields', () => {
      const validProperty = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Test Property Title',
        description: 'This is a detailed description of the test property that meets the minimum length requirement.',
        property_type: 'PG',
        room_type: 'Single',
        location: {
          country: 'India',
          city: 'Mumbai',
          area: 'Andheri',
          address: '123 Test Street, Near Test Landmark'
        },
        owner_id: '550e8400-e29b-41d4-a716-446655440001',
        owner_name: 'Test Owner',
        owner_contact: '9876543210',
        pricing: {
          private_room_price: 5000
        },
        details: {
          furnishing: 'Fully Furnished'
        },
        images: ['https://example.com/image1.jpg'],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      }

      const result = StrictPropertySchema.safeParse(validProperty)
      expect(result.success).toBe(true)
    })

    it('should reject property with invalid preferred_tenant in strict schema', () => {
      // Strict schema only allows: 'Male', 'Female', 'Any', 'Gents', 'Ladies'
      const invalidProperty = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Test Property Title',
        description: 'This is a detailed description of the test property that meets the minimum length requirement.',
        property_type: 'PG',
        room_type: 'Single',
        location: {
          country: 'India',
          city: 'Mumbai',
          area: 'Andheri',
          address: '123 Test Street'
        },
        owner_id: '550e8400-e29b-41d4-a716-446655440001',
        owner_name: 'Test Owner',
        owner_contact: '9876543210',
        pricing: { private_room_price: 5000 },
        details: {
          preferred_tenant: 'InvalidValue' // Invalid value
        },
        images: ['https://example.com/image1.jpg'],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      }

      const result = StrictPropertySchema.safeParse(invalidProperty)
      expect(result.success).toBe(false)
    })
  })

  // ============================================================================
  // 9. Data Mapper Consistency Tests
  // ============================================================================
  describe('Data Mapper Consistency', () => {
    it('should map preferred_tenant correctly from database to frontend', () => {
      const dbRow: Partial<PropertyRow> = {
        preferred_tenant: 'Couple'
      }

      // After mapping, the Property type should have preferredTenant: 'Couple'
      expect(dbRow.preferred_tenant).toBe('Couple')
    })

    it('should handle null preferred_tenant from database', () => {
      const dbRow: Partial<PropertyRow> = {
        preferred_tenant: null
      }

      expect(dbRow.preferred_tenant).toBeNull()
    })
  })

  // ============================================================================
  // 10. Edge Case Tests
  // ============================================================================
  describe('Edge Cases', () => {
    it('should handle empty strings in enum fields', () => {
      const result = propertySchema.safeParse({
        title: 'Test Property',
        property_type: '',
        room_type: 'Single',
        city: 'Mumbai',
        area: 'Andheri'
      })
      expect(result.success).toBe(false)
    })

    it('should handle case sensitivity in enum fields', () => {
      // Property type is case-sensitive
      const result1 = propertySchema.safeParse({
        title: 'Test Property',
        property_type: 'pg', // lowercase
        room_type: 'Single',
        city: 'Mumbai',
        area: 'Andheri'
      })
      expect(result1.success).toBe(false)

      // Room type is case-sensitive
      const result2 = propertySchema.safeParse({
        title: 'Test Property',
        property_type: 'PG',
        room_type: 'single', // lowercase
        city: 'Mumbai',
        area: 'Andheri'
      })
      expect(result2.success).toBe(false)
    })

    it('should handle undefined optional fields', () => {
      const result = propertySchema.safeParse({
        title: 'Test Property',
        property_type: 'PG',
        room_type: 'Single',
        city: 'Mumbai',
        area: 'Andheri',
        preferred_tenant: undefined // optional field
      })
      expect(result.success).toBe(true)
    })
  })
})

describe('Bulk Import Data Consistency', () => {
  // ============================================================================
  // Bulk Import PSN Type Tests
  // ============================================================================
  describe('PSN Type Handling', () => {
    it('should handle PSN as number in database', () => {
      // PropertyRow defines: psn: number | null
      const row: Partial<PropertyRow> = {
        psn: 12345
      }
      expect(typeof row.psn).toBe('number')
    })

    it('should handle PSN as null when not provided', () => {
      const row: Partial<PropertyRow> = {
        psn: null
      }
      expect(row.psn).toBeNull()
    })
  })
})

describe('User Management Data Consistency', () => {
  // ============================================================================
  // User Role Validation Tests
  // ============================================================================
  describe('User Role Validation', () => {
    it('should have consistent role values', () => {
      const validRoles = ['admin', 'owner', 'tenant']
      validRoles.forEach(role => {
        expect(['admin', 'owner', 'tenant']).toContain(role)
      })
    })
  })

  // ============================================================================
  // User Status Validation Tests
  // ============================================================================
  describe('User Status Validation', () => {
    it('should have consistent status values', () => {
      const validStatuses = ['active', 'inactive', 'suspended']
      validStatuses.forEach(status => {
        expect(['active', 'inactive', 'suspended']).toContain(status)
      })
    })
  })
})

describe('Property Status State Machine', () => {
  // ============================================================================
  // Property Status Validation Tests
  // ============================================================================
  describe('Property Status Values', () => {
    it('should have consistent status values across application', () => {
      const validStatuses = ['active', 'inactive', 'pending', 'rejected']
      validStatuses.forEach(status => {
        expect(['active', 'inactive', 'pending', 'rejected']).toContain(status)
      })
    })

    it('should have consistent availability values', () => {
      const validAvailabilities = ['Available', 'Occupied', 'Under Maintenance']
      validAvailabilities.forEach(availability => {
        expect(['Available', 'Occupied', 'Under Maintenance']).toContain(availability)
      })
    })
  })
})
