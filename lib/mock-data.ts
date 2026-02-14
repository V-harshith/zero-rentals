import { Property, User, SearchFilters } from './types'

// Mock Properties Data
export const MOCK_PROPERTIES: Property[] = [
    {
        id: '1',
        title: 'Luxury PG in Koramangala',
        description: 'Spacious and well-furnished PG accommodation in the heart of Koramangala. Perfect for working professionals. Close to metro station, shopping malls, and restaurants. 24/7 security, power backup, and high-speed WiFi included.',
        price: 12000,
        location: {
            city: 'Bangalore',
            area: 'Koramangala',
            address: '5th Block, Koramangala, Bangalore'
        },
        propertyType: 'PG',
        roomType: 'Single',
        images: [
            '/placeholder-property-1.jpg',
            '/placeholder-property-2.jpg',
            '/placeholder-property-3.jpg',
            '/placeholder-property-4.jpg'
        ],
        amenities: ['WiFi', 'AC', 'Laundry', 'Meals', 'Power Backup', 'Parking', 'Security', 'Housekeeping'],
        owner: {
            id: 'owner1',
            name: 'Rajesh Kumar',
            phone: '+91 98765 43210',
            email: 'rajesh@example.com',
            verified: true
        },
        availability: 'Available',
        postedDate: new Date('2024-01-15'),
        views: 234,
        featured: true,
        rules: ['No smoking', 'No pets', 'Visitors allowed till 9 PM'],
        nearbyPlaces: ['Metro Station (500m)', 'Forum Mall (1km)', 'Hospitals (2km)'],
        deposit: 24000,
        maintenance: 1000,
        furnishing: 'Fully Furnished',
        floorNumber: 3,
        totalFloors: 5,
        roomSize: 120,
        preferredTenant: 'Male'
    },
    {
        id: '2',
        title: 'Modern Co-living Space in HSR Layout',
        description: 'Premium co-living space with modern amenities. Fully furnished rooms with attached bathrooms. Community kitchen, lounge area, and rooftop terrace. Ideal for young professionals and students.',
        price: 15000,
        location: {
            city: 'Bangalore',
            area: 'HSR Layout',
            address: 'Sector 2, HSR Layout, Bangalore'
        },
        propertyType: 'Co-living',
        roomType: 'Single',
        images: [
            '/placeholder-property-2.jpg',
            '/placeholder-property-1.jpg',
            '/placeholder-property-3.jpg'
        ],
        amenities: ['WiFi', 'AC', 'Gym', 'Laundry', 'Meals', 'Power Backup', 'Parking', 'Security', 'Housekeeping', 'Swimming Pool'],
        owner: {
            id: 'owner2',
            name: 'Priya Sharma',
            phone: '+91 98765 43211',
            email: 'priya@example.com',
            verified: true
        },
        availability: 'Available',
        postedDate: new Date('2024-01-20'),
        views: 456,
        featured: true,
        deposit: 30000,
        maintenance: 1500,
        furnishing: 'Fully Furnished',
        floorNumber: 2,
        totalFloors: 4,
        roomSize: 150,
        preferredTenant: 'Any'
    },
    {
        id: '3',
        title: 'Affordable PG in Whitefield',
        description: 'Budget-friendly PG accommodation in Whitefield. Clean and comfortable rooms with all basic amenities. Close to IT parks and tech companies. Great for IT professionals.',
        price: 8500,
        location: {
            city: 'Bangalore',
            area: 'Whitefield',
            address: 'ITPL Main Road, Whitefield, Bangalore'
        },
        propertyType: 'PG',
        roomType: 'Double',
        images: [
            '/placeholder-property-3.jpg',
            '/placeholder-property-1.jpg'
        ],
        amenities: ['WiFi', 'Laundry', 'Meals', 'Power Backup', 'Security'],
        owner: {
            id: 'owner3',
            name: 'Amit Patel',
            phone: '+91 98765 43212',
            email: 'amit@example.com',
            verified: false
        },
        availability: 'Available',
        postedDate: new Date('2024-02-01'),
        views: 189,
        featured: false,
        deposit: 17000,
        maintenance: 500,
        furnishing: 'Semi Furnished',
        floorNumber: 1,
        totalFloors: 3,
        roomSize: 100,
        preferredTenant: 'Male'
    },
    {
        id: '4',
        title: '2BHK Apartment for Rent in Indiranagar',
        description: 'Spacious 2BHK apartment in prime Indiranagar location. Well-maintained building with modern amenities. Perfect for small families or working couples.',
        price: 25000,
        location: {
            city: 'Bangalore',
            area: 'Indiranagar',
            address: '100 Feet Road, Indiranagar, Bangalore'
        },
        propertyType: 'Rent',
        roomType: 'Apartment',
        images: [
            '/placeholder-property-4.jpg',
            '/placeholder-property-2.jpg',
            '/placeholder-property-1.jpg'
        ],
        amenities: ['WiFi', 'AC', 'Parking', 'Security', 'Power Backup', 'Gym'],
        owner: {
            id: 'owner4',
            name: 'Sunita Reddy',
            phone: '+91 98765 43213',
            email: 'sunita@example.com',
            verified: true
        },
        availability: 'Available',
        postedDate: new Date('2024-01-25'),
        views: 567,
        featured: true,
        deposit: 50000,
        maintenance: 2000,
        furnishing: 'Semi Furnished',
        floorNumber: 4,
        totalFloors: 8,
        roomSize: 1200,
        preferredTenant: 'Any'
    },
    {
        id: '5',
        title: 'Ladies PG in Jayanagar',
        description: 'Safe and secure PG for working women and students. Homely environment with nutritious meals. Strict security measures and CCTV surveillance.',
        price: 10000,
        location: {
            city: 'Bangalore',
            area: 'Jayanagar',
            address: '4th Block, Jayanagar, Bangalore'
        },
        propertyType: 'PG',
        roomType: 'Triple',
        images: [
            '/placeholder-property-1.jpg',
            '/placeholder-property-3.jpg'
        ],
        amenities: ['WiFi', 'Laundry', 'Meals', 'Security', 'Housekeeping', 'Power Backup'],
        owner: {
            id: 'owner5',
            name: 'Lakshmi Iyer',
            phone: '+91 98765 43214',
            email: 'lakshmi@example.com',
            verified: true
        },
        availability: 'Occupied',
        postedDate: new Date('2024-01-10'),
        views: 345,
        featured: false,
        deposit: 20000,
        maintenance: 800,
        furnishing: 'Fully Furnished',
        floorNumber: 2,
        totalFloors: 3,
        roomSize: 90,
        preferredTenant: 'Female'
    },
    {
        id: '6',
        title: 'Premium Co-living in Electronic City',
        description: 'State-of-the-art co-living facility near Electronic City. Modern infrastructure, high-speed internet, and professional environment. Perfect for IT professionals.',
        price: 18000,
        location: {
            city: 'Bangalore',
            area: 'Electronic City',
            address: 'Phase 1, Electronic City, Bangalore'
        },
        propertyType: 'Co-living',
        roomType: 'Single',
        images: [
            '/placeholder-property-2.jpg',
            '/placeholder-property-4.jpg',
            '/placeholder-property-3.jpg'
        ],
        amenities: ['WiFi', 'AC', 'Gym', 'Laundry', 'Meals', 'Power Backup', 'Parking', 'Security', 'Housekeeping', 'Conference Room'],
        owner: {
            id: 'owner2',
            name: 'Priya Sharma',
            phone: '+91 98765 43211',
            email: 'priya@example.com',
            verified: true
        },
        availability: 'Available',
        postedDate: new Date('2024-02-05'),
        views: 678,
        featured: true,
        deposit: 36000,
        maintenance: 2000,
        furnishing: 'Fully Furnished',
        floorNumber: 5,
        totalFloors: 10,
        roomSize: 140,
        preferredTenant: 'Any'
    }
]

// Mock Users Data
export const MOCK_USERS: User[] = [
    {
        id: 'user1',
        name: 'Arjun Mehta',
        email: 'arjun@example.com',
        phone: '+91 98765 11111',
        role: 'tenant',
        verified: true,
        registrationDate: new Date('2023-12-01'),
        status: 'active',
        inquiriesCount: 5
    },
    {
        id: 'user2',
        name: 'Sneha Kapoor',
        email: 'sneha@example.com',
        phone: '+91 98765 22222',
        role: 'tenant',
        verified: true,
        registrationDate: new Date('2024-01-15'),
        status: 'active',
        inquiriesCount: 3
    },
    {
        id: 'owner1',
        name: 'Rajesh Kumar',
        email: 'rajesh@example.com',
        phone: '+91 98765 43210',
        role: 'owner',
        verified: true,
        registrationDate: new Date('2023-11-10'),
        status: 'active',
        propertiesCount: 3
    },
    {
        id: 'owner2',
        name: 'Priya Sharma',
        email: 'priya@example.com',
        phone: '+91 98765 43211',
        role: 'owner',
        verified: true,
        registrationDate: new Date('2023-10-20'),
        status: 'active',
        propertiesCount: 5
    },
    {
        id: 'user3',
        name: 'Vikram Singh',
        email: 'vikram@example.com',
        phone: '+91 98765 33333',
        role: 'tenant',
        verified: false,
        registrationDate: new Date('2024-02-01'),
        status: 'active',
        inquiriesCount: 1
    },
    {
        id: 'owner3',
        name: 'Amit Patel',
        email: 'amit@example.com',
        phone: '+91 98765 43212',
        role: 'owner',
        verified: false,
        registrationDate: new Date('2024-01-05'),
        status: 'active',
        propertiesCount: 1
    }
]

// Common amenities list
export const AMENITIES_LIST = [
    'WiFi',
    'AC',
    'Parking',
    'Security',
    'Power Backup',
    'Laundry',
    'Meals',
    'Housekeeping',
    'Gym',
    'Swimming Pool',
    'TV',
    'Refrigerator',
    'Microwave',
    'Water Purifier',
    'Elevator',
    'CCTV',
    'Conference Room',
    'Garden',
    'Play Area'
]

// Helper function to get property by ID
export function getPropertyById(id: string): Property | undefined {
    return MOCK_PROPERTIES.find(p => p.id === id)
}

// Helper function to filter properties
export function filterProperties(filters: Partial<SearchFilters>): Property[] {
    let filtered = [...MOCK_PROPERTIES]

    if (filters.location) {
        filtered = filtered.filter(p =>
            p.location.area.toLowerCase().includes(filters.location!.toLowerCase()) ||
            p.location.city.toLowerCase().includes(filters.location!.toLowerCase())
        )
    }

    if (filters.propertyType) {
        filtered = filtered.filter(p => p.propertyType === filters.propertyType)
    }

    if (filters.roomType && filters.roomType.length > 0) {
        filtered = filtered.filter(p => filters.roomType!.includes(p.roomType))
    }

    if (filters.minPrice !== undefined) {
        filtered = filtered.filter(p => p.price >= filters.minPrice!)
    }

    if (filters.maxPrice !== undefined) {
        filtered = filtered.filter(p => p.price <= filters.maxPrice!)
    }

    if (filters.amenities && filters.amenities.length > 0) {
        filtered = filtered.filter(p =>
            filters.amenities!.every(amenity => p.amenities.includes(amenity))
        )
    }

    // Sorting
    if (filters.sortBy) {
        switch (filters.sortBy) {
            case 'price-asc':
                filtered.sort((a, b) => a.price - b.price)
                break
            case 'price-desc':
                filtered.sort((a, b) => b.price - a.price)
                break
            case 'date-desc':
                filtered.sort((a, b) => b.postedDate.getTime() - a.postedDate.getTime())
                break
            case 'popular':
                filtered.sort((a, b) => b.views - a.views)
                break
        }
    }

    return filtered
}
