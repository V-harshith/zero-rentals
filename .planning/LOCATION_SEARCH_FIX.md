# Location Search Fix - Implementation Plan
## Problem Statement
When searching for "BTM Layout" (an area in Bangalore), ALL properties in Bangalore are returned instead of just properties in BTM Layout.

## Root Cause Analysis
### Current Flow
1. User types in SearchBar
2. Google Places Autocomplete returns `{ placeId, address: "BTM Layout, Bangalore" }`
3. `handleSearch()` extracts city from address → "Bangalore"
4. Backend query: `WHERE city ILIKE '%Bangalore%' OR area ILIKE '%Bangalore%'`
5. Result: ALL Bangalore properties (because city matches)

### Why Previous Fix Failed
The keyword-based approach (checking for "layout", "nagar", etc.) was:
- Fragile - new area names won't be recognized
- Maintenance burden - need to update keyword list
- Different cities use different naming conventions

## Recommended Solution: Structured Location Data
Pass structured location data from Google Places to backend for precise matching.

## Implementation Plan

### Phase 1: Update Google Maps Utilities
**File:** `lib/google-maps-utils.ts`

Add new fields to `PlaceDetails`:
```typescript
export interface PlaceDetails {
    placeId: string
    formattedAddress: string
    latitude: number
    longitude: number
    city?: string
    state?: string
    country?: string
    postalCode?: string
    // NEW: Add sublocality/area field
    sublocality?: string  // e.g., "BTM Layout", "Koramangala"
}
```

**Update `getPlaceDetailsById`:**
Extract `sublocality` from address components:
- Look for types: `sublocality`, `neighborhood`, `political`, `administrative_area_level_2`, `administrative_area_level_3`
- Priority: sublocality > neighborhood > administrative_area_level_2 > administrative_area_level_3

- **Update `PlaceSuggestion`:**
Add optional sublocality field for display

### Phase 2: Update LocationInput Component
**File:** `components/search/LocationInput.tsx`

Update `onPlaceSelect` callback type:
```typescript
interface LocationInputProps {
    onPlaceSelect: (place: {
        placeId: string
        address: string
        // NEW: Add structured location data
        sublocality?: string
        city?: string
        state?: string
    }) => void
}
```

Update `handleSelectPlace` to pass structured data

### Phase 3: Update SearchBar Component
**File:** `components/search/SearchBar.tsx`

Update `handleSearch` to:
1. Call `getPlaceDetailsById(selectedPlace.placeId)`
2. Extract structured data (sublocality, city, state)
3. Pass to URL params:
   - `area` (if sublocality available)
   - `city` (if city available)
   - `state` (if state available)
   - `lat`, `lng` (for geospatial fallback)
4. Remove fallback text extraction logic

### Phase 4: Update Backend APIs
**Files:** `app/api/properties/route.ts`, `lib/data-service.ts`

Update location search to:
1. **Area search** (if `area` param exists):
   ```sql
   WHERE area ILIKE '%BTM Layout%'
   ```
2. **City search** (if only `city` param):
   ```sql
   WHERE city ILIKE '%Bangalore%'
   ```
3. **Geospatial search** (if `lat`/`lng` params):
   ```sql
   WHERE latitude BETWEEN X AND Y AND longitude BETWEEN A AND B
   ```
4. **Combined search** (if both `area` and `city`):
   ```sql
   WHERE area ILIKE '%BTM Layout%' AND city ILIKE '%Bangalore%'
   ```

### Phase 5: Testing
- Test Case 1: Search "BTM Layout" → Only BTM Layout properties
- Test Case 2: Search "Bangalore" → All Bangalore properties
- Test Case 3: Search "560068" → Only that pincode
- Test Case 4: Search with coordinates → Geospatial search
- Test Case 5: Search "BTM Layout, Bangalore" → Only BTM Layout properties

## Test Cases
| Input | Expected Result |
|------|------------------|
| "BTM Layout" | Only BTM Layout properties |
| "Bangalore" | All Bangalore properties |
| "560068" | Only that pincode |
| lat/lng | Geospatial search |
| "BTM Layout, Bangalore" | Only BTM Layout properties |
| "Koramangala" | Only Koramangala properties |

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Breaking existing searches | Keep `location` param as fallback |
| Google Maps API limits | Already using session tokens |
| Missing area data | Fallback to text extraction from address |

## Rollback Plan
If issues arise:
1. Revert all changes with `git revert HEAD`
2. Previous search behavior will be restored

## Estimated Effort
- Phase 1: 15 minutes
- Phase 2: 10 minutes
- Phase 3: 20 minutes
- Phase 4: 15 minutes
- Phase 5: 10 minutes
- Total: ~70 minutes

