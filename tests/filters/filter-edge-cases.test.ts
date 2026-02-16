import { describe, it, expect } from 'vitest'

// Simulating the parseFilters function from search/page.tsx
function parseFilters(params: URLSearchParams) {
    const lat = params.get("lat")
    const lng = params.get("lng")
    const minPrice = params.get("minPrice")
    const maxPrice = params.get("maxPrice")

    return {
        location: params.get("location") || "",
        propertyType: params.get("type") as any || undefined,
        roomType: params.getAll("roomType").length > 0 ? params.getAll("roomType")[0].split(",") : [],
        minPrice: minPrice && !isNaN(parseInt(minPrice)) ? parseInt(minPrice) : 0,
        maxPrice: maxPrice && !isNaN(parseInt(maxPrice)) ? parseInt(maxPrice) : 50000,
        amenities: params.getAll("amenities").length > 0 ? params.getAll("amenities")[0].split(",") : [],
        sortBy: "date-desc",
        gender: params.get("gender") as any || undefined,
        preferredTenant: params.get("preferredTenant") || undefined,
        lookingFor: params.get("lookingFor") as any || undefined,
        useUserLocation: params.get("useUserLocation") === "true",
        coordinates: lat && lng ? {
            lat: parseFloat(lat),
            lng: parseFloat(lng)
        } : undefined
    }
}

// Simulating URL params building from filters (matches updated page.tsx logic)
function buildUrlParams(filters: any) {
    const params = new URLSearchParams()
    if (filters.location) params.set("location", filters.location)
    if (filters.propertyType) params.set("type", filters.propertyType)
    if (filters.roomType?.length) params.set("roomType", filters.roomType.join(","))
    if (filters.amenities?.length) params.set("amenities", filters.amenities.join(","))
    // Only set price params if they differ from defaults (minPrice=0, maxPrice=50000)
    if (filters.minPrice !== undefined && filters.minPrice > 0) params.set("minPrice", filters.minPrice.toString())
    if (filters.maxPrice !== undefined && filters.maxPrice < 50000) params.set("maxPrice", filters.maxPrice.toString())
    if (filters.gender) params.set("gender", filters.gender)
    if (filters.preferredTenant) params.set("preferredTenant", filters.preferredTenant)
    if (filters.lookingFor) params.set("lookingFor", filters.lookingFor)
    if (filters.useUserLocation) params.set("useUserLocation", "true")
    if (filters.coordinates) {
        params.set("lat", filters.coordinates.lat.toString())
        params.set("lng", filters.coordinates.lng.toString())
    }
    return params
}

describe('FILTERS - URL Parameter Variations', () => {
    describe('Direct URL with all filters', () => {
        it('should parse complete filter set from URL', () => {
            const url = new URL('http://localhost/search?location=Bangalore&type=PG&roomType=Single,Double&minPrice=5000&maxPrice=15000&amenities=WiFi,AC&gender=Male')
            const filters = parseFilters(url.searchParams)

            expect(filters.location).toBe('Bangalore')
            expect(filters.propertyType).toBe('PG')
            expect(filters.roomType).toEqual(['Single', 'Double'])
            expect(filters.minPrice).toBe(5000)
            expect(filters.maxPrice).toBe(15000)
            expect(filters.amenities).toEqual(['WiFi', 'AC'])
            expect(filters.gender).toBe('Male')
        })

        it('should parse URL with coordinates', () => {
            const url = new URL('http://localhost/search?location=Bangalore&lat=12.9716&lng=77.5946&useUserLocation=true')
            const filters = parseFilters(url.searchParams)

            expect(filters.location).toBe('Bangalore')
            expect(filters.coordinates).toEqual({ lat: 12.9716, lng: 77.5946 })
            expect(filters.useUserLocation).toBe(true)
        })
    })

    describe('URL with partial filters', () => {
        it('should handle URL with only location', () => {
            const url = new URL('http://localhost/search?location=Mumbai')
            const filters = parseFilters(url.searchParams)

            expect(filters.location).toBe('Mumbai')
            expect(filters.propertyType).toBeUndefined()
            expect(filters.roomType).toEqual([])
            expect(filters.minPrice).toBe(0)
            expect(filters.maxPrice).toBe(50000)
        })

        it('should handle URL with only price range', () => {
            const url = new URL('http://localhost/search?minPrice=10000&maxPrice=20000')
            const filters = parseFilters(url.searchParams)

            expect(filters.location).toBe('')
            expect(filters.minPrice).toBe(10000)
            expect(filters.maxPrice).toBe(20000)
        })

        it('should handle URL with only property type', () => {
            const url = new URL('http://localhost/search?type=Co-living')
            const filters = parseFilters(url.searchParams)

            expect(filters.propertyType).toBe('Co-living')
            expect(filters.location).toBe('')
        })
    })

    describe('URL with invalid filter values', () => {
        it('should handle invalid price values gracefully', () => {
            const url = new URL('http://localhost/search?minPrice=invalid&maxPrice=abc')
            const filters = parseFilters(url.searchParams)

            // Should fall back to defaults
            expect(filters.minPrice).toBe(0)
            expect(filters.maxPrice).toBe(50000)
        })

        it('BUG: Invalid coordinate values create NaN coordinates', () => {
            const url = new URL('http://localhost/search?lat=invalid&lng=abc')
            const filters = parseFilters(url.searchParams)

            // BUG: The code doesn't validate parseFloat result before creating coordinates
            expect(filters.coordinates).toEqual({ lat: NaN, lng: NaN })
            // EXPECTED: Should be undefined when coordinates are invalid
        })

        it('should handle empty string values', () => {
            const url = new URL('http://localhost/search?location=&type=')
            const filters = parseFilters(url.searchParams)

            expect(filters.location).toBe('')
            expect(filters.propertyType).toBeUndefined()
        })

        it('should handle malformed roomType parameter', () => {
            const url = new URL('http://localhost/search?roomType=')
            const filters = parseFilters(url.searchParams)

            expect(filters.roomType).toEqual([''])
        })
    })

    describe('Empty filter values', () => {
        it('should handle completely empty URL params', () => {
            const url = new URL('http://localhost/search')
            const filters = parseFilters(url.searchParams)

            expect(filters.location).toBe('')
            expect(filters.propertyType).toBeUndefined()
            expect(filters.roomType).toEqual([])
            expect(filters.amenities).toEqual([])
            expect(filters.minPrice).toBe(0)
            expect(filters.maxPrice).toBe(50000)
        })

        it('should handle URL with only empty params', () => {
            const url = new URL('http://localhost/search?location=&type=&minPrice=')
            const filters = parseFilters(url.searchParams)

            expect(filters.location).toBe('')
            expect(filters.propertyType).toBeUndefined()
            expect(filters.minPrice).toBe(0)
        })
    })

    describe('URL parameter encoding', () => {
        it('should handle encoded location names', () => {
            const url = new URL('http://localhost/search?location=Koramangala%2C%20Bangalore')
            const filters = parseFilters(url.searchParams)

            expect(filters.location).toBe('Koramangala, Bangalore')
        })

        it('should handle special characters in location', () => {
            const url = new URL('http://localhost/search?location=St.%20John%27s%20Road')
            const filters = parseFilters(url.searchParams)

            expect(filters.location).toBe("St. John's Road")
        })
    })
})

describe('FILTERS - Round-trip Serialization', () => {
    it('should preserve filters through parse/build cycle', () => {
        const originalFilters = {
            location: 'Bangalore',
            propertyType: 'PG',
            roomType: ['Single', 'Double'],
            minPrice: 5000,
            maxPrice: 15000,
            amenities: ['WiFi', 'AC'],
            gender: 'Male',
        }

        const params = buildUrlParams(originalFilters)
        const parsedFilters = parseFilters(params)

        expect(parsedFilters.location).toBe(originalFilters.location)
        expect(parsedFilters.propertyType).toBe(originalFilters.propertyType)
        expect(parsedFilters.roomType).toEqual(originalFilters.roomType)
        expect(parsedFilters.minPrice).toBe(originalFilters.minPrice)
        expect(parsedFilters.maxPrice).toBe(originalFilters.maxPrice)
        expect(parsedFilters.amenities).toEqual(originalFilters.amenities)
        expect(parsedFilters.gender).toBe(originalFilters.gender)
    })

    it('should handle coordinates round-trip', () => {
        const originalFilters = {
            location: 'Bangalore',
            coordinates: { lat: 12.9716, lng: 77.5946 },
            useUserLocation: true,
        }

        const params = buildUrlParams(originalFilters)
        const parsedFilters = parseFilters(params)

        expect(parsedFilters.coordinates).toEqual(originalFilters.coordinates)
        expect(parsedFilters.useUserLocation).toBe(true)
    })
})

describe('FILTERS - Edge Cases', () => {
    it('should handle zero price values', () => {
        const url = new URL('http://localhost/search?minPrice=0&maxPrice=0')
        const filters = parseFilters(url.searchParams)

        expect(filters.minPrice).toBe(0)
        expect(filters.maxPrice).toBe(0)
    })

    it('should handle very large price values', () => {
        const url = new URL('http://localhost/search?minPrice=100000&maxPrice=1000000')
        const filters = parseFilters(url.searchParams)

        expect(filters.minPrice).toBe(100000)
        expect(filters.maxPrice).toBe(1000000)
    })

    it('BUG: Negative price values are accepted', () => {
        const url = new URL('http://localhost/search?minPrice=-1000&maxPrice=-500')
        const filters = parseFilters(url.searchParams)

        // BUG: The code only checks for NaN, not negative values
        expect(filters.minPrice).toBe(-1000) // Bug: accepts negative
        expect(filters.maxPrice).toBe(-500) // Bug: accepts negative
        // EXPECTED: Should fall back to defaults (0 and 50000)
    })

    it('should handle many amenities', () => {
        const url = new URL('http://localhost/search?amenities=WiFi,AC,Parking,Gym,Security,Laundry,Meals,TV,Fridge')
        const filters = parseFilters(url.searchParams)

        expect(filters.amenities).toEqual(['WiFi', 'AC', 'Parking', 'Gym', 'Security', 'Laundry', 'Meals', 'TV', 'Fridge'])
    })

    it('should handle duplicate room types', () => {
        const url = new URL('http://localhost/search?roomType=Single,Single,Double')
        const filters = parseFilters(url.searchParams)

        // Current implementation doesn't deduplicate
        expect(filters.roomType).toEqual(['Single', 'Single', 'Double'])
    })
})

describe('FILTERS - Navigation Scenarios', () => {
    it('should handle back navigation with filters', () => {
        // Simulate user navigating back to search with filters
        const url = new URL('http://localhost/search?location=Bangalore&type=PG')
        const filters = parseFilters(url.searchParams)

        expect(filters.location).toBe('Bangalore')
        expect(filters.propertyType).toBe('PG')
    })

    it('should handle refresh with complex filters', () => {
        const url = new URL('http://localhost/search?location=Bangalore&lat=12.9716&lng=77.5946&type=PG&roomType=Single&minPrice=5000&maxPrice=15000&amenities=WiFi,AC&gender=Male&useUserLocation=true')
        const filters = parseFilters(url.searchParams)

        expect(filters.location).toBe('Bangalore')
        expect(filters.coordinates).toEqual({ lat: 12.9716, lng: 77.5946 })
        expect(filters.propertyType).toBe('PG')
        expect(filters.useUserLocation).toBe(true)
    })

    it('should handle new search clearing filters', () => {
        // New search typically starts with empty or minimal params
        const url = new URL('http://localhost/search')
        const filters = parseFilters(url.searchParams)

        expect(filters.location).toBe('')
        expect(filters.propertyType).toBeUndefined()
        expect(filters.roomType).toEqual([])
    })
})

describe('FILTERS - Mobile vs Desktop', () => {
    it('should parse filters the same way on mobile and desktop', () => {
        const mobileUrl = new URL('http://localhost/search?location=Bangalore&type=PG&roomType=Single')
        const desktopUrl = new URL('http://localhost/search?location=Bangalore&type=PG&roomType=Single')

        const mobileFilters = parseFilters(mobileUrl.searchParams)
        const desktopFilters = parseFilters(desktopUrl.searchParams)

        expect(mobileFilters).toEqual(desktopFilters)
    })

    it('should handle touch device coordinates', () => {
        // Mobile devices may have slightly different coordinates
        const url = new URL('http://localhost/search?lat=12.9716123&lng=77.5946123')
        const filters = parseFilters(url.searchParams)

        expect(filters.coordinates?.lat).toBe(12.9716123)
        expect(filters.coordinates?.lng).toBe(77.5946123)
    })
})

describe('FILTERS - Property Type Specific Behavior', () => {
    it('should handle Rent property type', () => {
        const url = new URL('http://localhost/search?type=Rent&roomType=1%20BHK,2%20BHK')
        const filters = parseFilters(url.searchParams)

        expect(filters.propertyType).toBe('Rent')
        expect(filters.roomType).toEqual(['1 BHK', '2 BHK'])
    })

    it('should handle Co-living property type', () => {
        const url = new URL('http://localhost/search?type=Co-living&roomType=Single,Double&gender=Couple')
        const filters = parseFilters(url.searchParams)

        expect(filters.propertyType).toBe('Co-living')
        expect(filters.gender).toBe('Couple')
    })

    it('should handle PG property type', () => {
        const url = new URL('http://localhost/search?type=PG&roomType=Single,Double,Triple,Four%20Sharing&gender=Female')
        const filters = parseFilters(url.searchParams)

        expect(filters.propertyType).toBe('PG')
        expect(filters.roomType).toEqual(['Single', 'Double', 'Triple', 'Four Sharing'])
        expect(filters.gender).toBe('Female')
    })
})

// ============================================================================
// PRICE RANGE FILTER TESTS - Testing the filterByPriceRange logic
// ============================================================================

interface MockProperty {
    id: string
    price: number  // Minimum price (computed)
    roomPrices?: {
        '1rk'?: number
        single?: number
        double?: number
        triple?: number
        four?: number
    }
}

// Simulating the updated filterByPriceRange function from data-service.ts
function filterByPriceRange(properties: MockProperty[], filters: { minPrice?: number; maxPrice?: number }): MockProperty[] {
    // Skip filtering if no price constraints are set (or defaults are used)
    const hasMinPrice = filters.minPrice !== undefined && filters.minPrice > 0
    const hasMaxPrice = filters.maxPrice !== undefined && filters.maxPrice < 50000

    if (!hasMinPrice && !hasMaxPrice) {
        return properties
    }

    return properties.filter(p => {
        // Get all available room prices for this property
        const roomPrices = [
            p.roomPrices?.['1rk'],
            p.roomPrices?.single,
            p.roomPrices?.double,
            p.roomPrices?.triple,
            p.roomPrices?.four,
            p.price // Also include the computed minimum price as fallback
        ].filter((price): price is number => price !== undefined && price > 0)

        // If no prices available, exclude the property when filtering by price
        if (roomPrices.length === 0) {
            return false
        }

        // Check if ANY room price falls within the specified range
        // This ensures properties are shown if they have at least one room type
        // that matches the user's budget
        return roomPrices.some(price => {
            const aboveMin = !hasMinPrice || price >= filters.minPrice!
            const belowMax = !hasMaxPrice || price <= filters.maxPrice!
            return aboveMin && belowMax
        })
    })
}

describe('PRICE RANGE FILTER - Core Logic', () => {
    const mockProperties: MockProperty[] = [
        { id: '1', price: 5000, roomPrices: { single: 5000, double: 4000, triple: 3000 } }, // Min=3000, Max=5000
        { id: '2', price: 8000, roomPrices: { single: 8000, double: 7000, triple: 6000 } }, // Min=6000, Max=8000
        { id: '3', price: 12000, roomPrices: { single: 12000, double: 10000, four: 8000 } }, // Min=8000, Max=12000
        { id: '4', price: 15000, roomPrices: { single: 15000, double: 14000 } }, // Min=14000, Max=15000
        { id: '5', price: 0, roomPrices: {} }, // No prices
        { id: '6', price: 6000, roomPrices: { single: 6000 } }, // Only one price
    ]

    describe('Only minPrice selected', () => {
        it('should show properties with ANY room price >= minPrice', () => {
            // User selects minPrice=7000, should see properties with prices 8000, 10000, 12000, 14000, 15000
            const result = filterByPriceRange(mockProperties, { minPrice: 7000, maxPrice: 50000 })

            // Property 1: max price is 5000 (< 7000) - EXCLUDE
            // Property 2: has prices 8000, 7000, 6000 (8000 >= 7000) - INCLUDE
            // Property 3: has prices 12000, 10000, 8000 (all >= 7000) - INCLUDE
            // Property 4: has prices 15000, 14000 (all >= 7000) - INCLUDE
            // Property 5: no prices - EXCLUDE
            // Property 6: price is 6000 (< 7000) - EXCLUDE
            expect(result.map(p => p.id)).toEqual(['2', '3', '4'])
        })

        it('should include property if at least one room type matches (even if min price is below)', () => {
            // Property 3 has prices: single=12000, double=10000, four=8000
            // minPrice=9000, maxPrice=50000
            // Even though four=8000 (< 9000), single=12000 and double=10000 are >= 9000
            const result = filterByPriceRange([mockProperties[2]], { minPrice: 9000, maxPrice: 50000 })
            expect(result.length).toBe(1)
        })

        it('should handle minPrice=0 (no filtering)', () => {
            const result = filterByPriceRange(mockProperties, { minPrice: 0, maxPrice: 50000 })
            expect(result.length).toBe(mockProperties.length)
        })
    })

    describe('Only maxPrice selected', () => {
        it('should show properties with ANY room price <= maxPrice', () => {
            // User selects maxPrice=10000, should see properties with at least one room <= 10000
            const result = filterByPriceRange(mockProperties, { minPrice: 0, maxPrice: 10000 })

            // Property 1: has prices 5000, 4000, 3000 (all <= 10000) - INCLUDE
            // Property 2: has prices 8000, 7000, 6000 (all <= 10000) - INCLUDE
            // Property 3: has prices 12000, 10000, 8000 (10000 and 8000 <= 10000) - INCLUDE
            // Property 4: has prices 15000, 14000 (both > 10000) - EXCLUDE
            // Property 5: no prices - EXCLUDE
            // Property 6: price is 6000 (<= 10000) - INCLUDE
            expect(result.map(p => p.id)).toEqual(['1', '2', '3', '6'])
        })

        it('should handle maxPrice=50000 (no filtering)', () => {
            const result = filterByPriceRange(mockProperties, { minPrice: 0, maxPrice: 50000 })
            expect(result.length).toBe(mockProperties.length)
        })
    })

    describe('Both min and max selected', () => {
        it('should show properties with ANY room price within range', () => {
            // User selects minPrice=7000, maxPrice=12000
            const result = filterByPriceRange(mockProperties, { minPrice: 7000, maxPrice: 12000 })

            // Property 1: max price 5000 (< 7000) - EXCLUDE
            // Property 2: has 8000, 7000, 6000 (8000 and 7000 in range) - INCLUDE
            // Property 3: has 12000, 10000, 8000 (all in range) - INCLUDE
            // Property 4: min price 14000 (> 12000) - EXCLUDE
            // Property 5: no prices - EXCLUDE
            // Property 6: price 6000 (< 7000) - EXCLUDE
            expect(result.map(p => p.id)).toEqual(['2', '3'])
        })

        it('should include property if any room type falls within range', () => {
            // Property 2: single=8000, double=7000, triple=6000
            // Range: 6500-7500
            // double=7000 is within range, so property should be included
            const result = filterByPriceRange([mockProperties[1]], { minPrice: 6500, maxPrice: 7500 })
            expect(result.length).toBe(1)
        })
    })

    describe('No price range selected (defaults)', () => {
        it('should return all properties when minPrice=0 and maxPrice=50000', () => {
            const result = filterByPriceRange(mockProperties, { minPrice: 0, maxPrice: 50000 })
            expect(result.length).toBe(mockProperties.length)
        })

        it('should return all properties when filters are empty', () => {
            const result = filterByPriceRange(mockProperties, {})
            expect(result.length).toBe(mockProperties.length)
        })
    })

    describe('Edge cases', () => {
        it('should exclude properties with no prices when filtering', () => {
            const result = filterByPriceRange([mockProperties[4]], { minPrice: 1000, maxPrice: 50000 })
            expect(result.length).toBe(0)
        })

        it('should handle single room price property', () => {
            const result = filterByPriceRange([mockProperties[5]], { minPrice: 5000, maxPrice: 7000 })
            // Property 6 has only single=6000, which is within 5000-7000
            expect(result.length).toBe(1)
        })

        it('should handle exact boundary values', () => {
            // Property 3 has single=12000
            const result = filterByPriceRange([mockProperties[2]], { minPrice: 12000, maxPrice: 12000 })
            expect(result.length).toBe(1) // 12000 >= 12000 AND 12000 <= 12000
        })

        it('should handle very large price ranges', () => {
            const result = filterByPriceRange(mockProperties, { minPrice: 1, maxPrice: 100000 })
            // Excludes only property 5 (no prices)
            expect(result.map(p => p.id)).toEqual(['1', '2', '3', '4', '6'])
        })

        it('should handle negative minPrice (treat as no filter)', () => {
            const result = filterByPriceRange(mockProperties, { minPrice: -1000, maxPrice: 50000 })
            // Negative minPrice is treated as 0, so no filtering
            expect(result.length).toBe(mockProperties.length)
        })
    })
})

describe('PRICE RANGE FILTER - Real-world Scenarios', () => {
    it('Scenario: User with budget 7000+ should see properties with higher-priced rooms', () => {
        // This is the exact bug reported: selecting 7000 should show 12000, 14000, etc.
        const properties: MockProperty[] = [
            { id: 'budget1', price: 5000, roomPrices: { single: 5000, double: 4000 } },
            { id: 'budget2', price: 6000, roomPrices: { single: 6000, double: 5000 } },
            { id: 'premium1', price: 12000, roomPrices: { single: 12000, double: 10000 } },
            { id: 'premium2', price: 14000, roomPrices: { single: 14000, double: 12000 } },
        ]

        const result = filterByPriceRange(properties, { minPrice: 7000, maxPrice: 50000 })

        // Should show premium properties even though they have some rooms below 7000
        expect(result.map(p => p.id)).toContain('premium1')
        expect(result.map(p => p.id)).toContain('premium2')
        expect(result.map(p => p.id)).not.toContain('budget1')
        expect(result.map(p => p.id)).not.toContain('budget2')
    })

    it('Scenario: User looking for mid-range should see matching properties', () => {
        const properties: MockProperty[] = [
            { id: 'cheap', price: 3000, roomPrices: { single: 3000, double: 2500 } },
            { id: 'mid', price: 8000, roomPrices: { single: 8000, double: 7000, triple: 6000 } },
            { id: 'expensive', price: 15000, roomPrices: { single: 15000, double: 14000 } },
        ]

        // Looking for properties with rooms between 5000-10000
        const result = filterByPriceRange(properties, { minPrice: 5000, maxPrice: 10000 })

        // 'mid' has rooms at 8000, 7000, 6000 - all within range
        expect(result.map(p => p.id)).toContain('mid')
        // 'cheap' max is 3000 - outside range
        expect(result.map(p => p.id)).not.toContain('cheap')
        // 'expensive' min is 14000 - outside range
        expect(result.map(p => p.id)).not.toContain('expensive')
    })

    it('Scenario: PG with multiple sharing options should appear for various budgets', () => {
        const pgProperty: MockProperty = {
            id: 'pg1',
            price: 4000,  // Minimum (triple sharing)
            roomPrices: {
                single: 12000,
                double: 8000,
                triple: 6000,
                four: 4000
            }
        }

        // Budget 10000+ should still see this PG because it has single room at 12000
        const highBudget = filterByPriceRange([pgProperty], { minPrice: 10000, maxPrice: 50000 })
        expect(highBudget.length).toBe(1)

        // Budget 5000-7000 should see this PG because it has triple at 6000 and four at 4000 (partial match)
        const midBudget = filterByPriceRange([pgProperty], { minPrice: 5000, maxPrice: 7000 })
        expect(midBudget.length).toBe(1)

        // Budget < 4000 should not see this PG
        const lowBudget = filterByPriceRange([pgProperty], { minPrice: 1000, maxPrice: 3000 })
        expect(lowBudget.length).toBe(0)
    })
})
