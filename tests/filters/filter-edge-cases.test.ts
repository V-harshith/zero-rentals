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

// Simulating URL params building from filters
function buildUrlParams(filters: any) {
    const params = new URLSearchParams()
    if (filters.location) params.set("location", filters.location)
    if (filters.propertyType) params.set("type", filters.propertyType)
    if (filters.roomType?.length) params.set("roomType", filters.roomType.join(","))
    if (filters.amenities?.length) params.set("amenities", filters.amenities.join(","))
    if (filters.minPrice) params.set("minPrice", filters.minPrice.toString())
    if (filters.maxPrice) params.set("maxPrice", filters.maxPrice.toString())
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
