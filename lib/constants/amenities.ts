/**
 * Single source of truth for room types, amenities, and filters
 * Used across homepage, search, and property posting flows
 */

// Room Types by Property Type
export const ROOM_TYPES = {
  PG: ['Single', 'Double', 'Triple', 'Four Sharing'],
  'Co-living': ['Single', 'Double'],
  Rent: ['1 RK', '1 BHK', '2 BHK', '3 BHK', '4 BHK']
} as const

// Amenities with Lucide icon names
export const AMENITIES = [
  { id: 'wifi', label: 'WiFi', icon: 'Wifi' },
  { id: 'ac', label: 'AC', icon: 'Snowflake' },
  { id: 'parking', label: 'Parking', icon: 'Car' },
  { id: 'gym', label: 'Gym', icon: 'Dumbbell' },
  { id: 'security', label: 'Security', icon: 'Shield' },
  { id: 'laundry', label: 'Laundry', icon: 'WashingMachine' },
  { id: 'meals', label: 'Meals', icon: 'Utensils' }
] as const

// Gender options (updated from Any to Couple)
export const GENDER_OPTIONS = ['Couple', 'Male', 'Female'] as const

// Property types
export const PROPERTY_TYPES = ['PG', 'Co-living', 'Rent'] as const
