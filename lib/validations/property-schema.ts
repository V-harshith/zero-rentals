import { z } from 'zod'

export const propertySchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(100),
  description: z.string().min(20, 'Description must be at least 20 characters').optional(),
  property_type: z.enum(['PG', 'Co-living', 'Rent']),
  room_type: z.enum(['Single', 'Double', 'Triple', 'Four Sharing', 'Apartment', '1RK']),
  
  country: z.string().default('India'),
  city: z.string().min(2, 'City is required'),
  area: z.string().min(2, 'Area is required'),
  locality: z.string().optional(),
  address: z.string().optional(),
  landmark: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  
  one_rk_price: z.number().min(0).optional(),
  private_room_price: z.number().min(0).optional(),
  double_sharing_price: z.number().min(0).optional(),
  triple_sharing_price: z.number().min(0).optional(),
  four_sharing_price: z.number().min(0).optional(),
  deposit: z.number().min(0).optional(),
  maintenance: z.number().min(0).optional(),
  
  furnishing: z.enum(['Fully Furnished', 'Semi Furnished', 'Unfurnished']).optional(),
  floor_number: z.number().optional(),
  total_floors: z.number().optional(),
  room_size: z.number().optional(),
  preferred_tenant: z.enum(['Male', 'Female', 'Any', 'Gents', 'Ladies']).optional(),
  
  facilities: z.array(z.string()).optional(),
  amenities: z.array(z.string()).optional(),
  usp: z.string().optional(),
  rules: z.array(z.string()).optional(),
  nearby_places: z.array(z.string()).optional(),
  
  images: z.array(z.string()).optional(),
  videos: z.array(z.string()).optional(),
})

export type PropertyFormData = z.infer<typeof propertySchema>
