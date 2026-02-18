# Data Consistency Test Report

**Date:** 2026-02-18
**Test File:** `tests/data-consistency.test.ts`
**Status:** All 37 tests passing

## Summary

This report documents the data consistency validation across the ZeroRentals application, covering database constraints, TypeScript types, Zod validation schemas, and UI components.

## Test Categories

### 1. Property Type Validation (3 tests)
- Valid property types: `PG`, `Co-living`, `Rent`
- Invalid property types correctly rejected
- Database constraint alignment verified

### 2. Room Type Validation (3 tests)
- Valid room types: `Single`, `Double`, `Triple`, `Four Sharing`, `Apartment`, `1RK`
- Invalid room types correctly rejected
- Database constraint alignment verified

### 3. Property Type + Room Type Consistency (3 tests)
- PG properties work with sharing room types
- Rent properties work with `Apartment`/`1RK` room types
- Co-living properties work with sharing room types

### 4. Preferred Tenant Validation (5 tests)
- **DOCUMENTED ISSUE:** `propertySchema` (lib/validations/property-schema.ts) accepts `['Male', 'Female', 'Any', 'Gents', 'Ladies']` but NOT `'Couple'`
- NULL preferred_tenant accepted
- GENDERS constant: `['Male', 'Female', 'Couple']`
- GENDER_OPTIONS constant: `['Couple', 'Male', 'Female']`
- Cross-source consistency verified

### 5. Database Constraint Alignment (4 tests)
- **Database:** `CHECK (preferred_tenant IN ('Male', 'Female', 'Couple') OR preferred_tenant IS NULL)`
- **PropertySchema:** Uses GENDERS = `['Male', 'Female', 'Couple']` - Aligned with DB
- **propertySchema:** Uses `['Male', 'Female', 'Any', 'Gents', 'Ladies']` - NOT aligned with DB
- Property type and room type constraints aligned

### 6. TypeScript Type Alignment (2 tests)
- PropertyRow.preferred_tenant: `'Male' | 'Female' | 'Couple' | 'Any' | null`
- Property.preferredTenant: `'Male' | 'Female' | 'Couple' | 'Any'`

### 7. Search Filter Validation (3 tests)
- property_type filter validation
- room_type filter validation
- preferred_tenant filter validation

### 8. Strict Schema Validation (2 tests)
- StrictPropertySchema enforces all required fields
- Invalid preferred_tenant values rejected

### 9. Data Mapper Consistency (2 tests)
- preferred_tenant maps correctly from DB to frontend
- null preferred_tenant handled correctly

### 10. Edge Cases (3 tests)
- Empty strings in enum fields rejected
- Case sensitivity enforced
- Undefined optional fields handled

### 11. Bulk Import Data Consistency (2 tests)
- PSN handled as number in database
- PSN null handling verified

### 12. User Management Data Consistency (2 tests)
- User roles: `admin`, `owner`, `tenant`
- User statuses: `active`, `inactive`, `suspended`

### 13. Property Status State Machine (2 tests)
- Property statuses: `active`, `inactive`, `pending`, `rejected`
- Availability values: `Available`, `Occupied`, `Under Maintenance`

## Known Issues Documented

### Issue 1: propertySchema preferred_tenant Inconsistency
**File:** `lib/validations/property-schema.ts`

**Current:**
```typescript
preferred_tenant: z.enum(['Male', 'Female', 'Any', 'Gents', 'Ladies']).optional()
```

**Expected (to match database):**
```typescript
preferred_tenant: z.enum(['Male', 'Female', 'Couple']).optional()
```

**Impact:**
- The `propertySchema` does not accept `'Couple'` which is a valid database value
- `'Any'`, `'Gents'`, `'Ladies'` are accepted by the schema but NOT valid per database constraint

**Recommendation:**
Update `propertySchema` to align with the database constraint:
```typescript
preferred_tenant: z.enum(['Male', 'Female', 'Couple']).optional()
```

## Database Constraints Verified

### properties table:
```sql
-- Property type
CHECK (property_type IN ('PG', 'Co-living', 'Rent'))

-- Room type
CHECK (room_type IN ('Single', 'Double', 'Triple', 'Four Sharing', 'Apartment', '1RK'))

-- Preferred tenant
CHECK (preferred_tenant IN ('Male', 'Female', 'Couple') OR preferred_tenant IS NULL)

-- Status
CHECK (status IN ('active', 'inactive', 'pending', 'rejected'))

-- Availability
CHECK (availability IN ('Available', 'Occupied', 'Under Maintenance'))
```

### users table:
```sql
-- Role
CHECK (role IN ('admin', 'owner', 'tenant'))

-- Status
CHECK (status IN ('active', 'inactive', 'suspended'))
```

## Schema Alignment Matrix

| Constraint | Database | propertySchema | PropertySchema | StrictPropertySchema | Status |
|------------|----------|----------------|----------------|---------------------|--------|
| property_type | PG, Co-living, Rent | Aligned | Aligned | Aligned | OK |
| room_type | Single, Double, Triple, Four Sharing, Apartment, 1RK | Aligned | Aligned | Aligned | OK |
| preferred_tenant | Male, Female, Couple, NULL | **MISALIGNED** | Aligned | Partial | **ISSUE** |
| status | active, inactive, pending, rejected | - | - | Aligned | OK |

## Recommendations

1. **Fix propertySchema preferred_tenant:** Update to accept only `['Male', 'Female', 'Couple']` to match database constraint

2. **Audit all preferred_tenant usage:** Search for `'Any'`, `'Gents'`, `'Ladies'` in the codebase and update to valid values

3. **Add migration if needed:** If any existing data uses invalid values (`'Any'`, `'Gents'`, `'Ladies'`), migrate to valid values

4. **Standardize on single schema:** Consider consolidating `propertySchema` and `PropertySchema` to avoid confusion

## Test Execution

```bash
npm run test:unit -- tests/data-consistency.test.ts
```

All 37 tests pass, documenting both correct behavior and known issues.
