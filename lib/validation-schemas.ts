import { z } from 'zod';

// Property submission validation
export const propertySchema = z.object({
    title: z.string().min(10, 'Title must be at least 10 characters').max(100, 'Title must be less than 100 characters'),
    description: z.string().min(50, 'Description must be at least 50 characters').max(2000, 'Description must be less than 2000 characters'),
    propertyType: z.enum(['PG', 'Co-living', 'Rent'], {
        errorMap: () => ({ message: 'Please select a valid property type' }),
    }),
    roomType: z.enum(['Single', 'Double', 'Triple', 'Four Sharing', 'Apartment', '1RK'], {
        errorMap: () => ({ message: 'Please select a valid room type' }),
    }),
    city: z.string().min(2, 'City is required'),
    area: z.string().min(2, 'Area is required'),
    pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
    address: z.string().min(10, 'Address must be at least 10 characters'),
    price: z.number().min(1000, 'Price must be at least ₹1,000').max(1000000, 'Price seems too high'),
    deposit: z.number().min(0).optional(),
    maintenance: z.number().min(0).optional(),
    amenities: z.array(z.string()).min(1, 'Select at least one amenity'),
    furnishing: z.enum(['Fully Furnished', 'Semi Furnished', 'Unfurnished']),
    floorNumber: z.number().min(0).max(100).optional(),
    totalFloors: z.number().min(1).max(100).optional(),
    roomSize: z.number().min(50, 'Room size must be at least 50 sqft').max(10000).optional(),
    preferredTenant: z.enum(['Male', 'Female', 'Any']),
    rules: z.array(z.string()).optional(),
    images: z.array(z.string()).min(1, 'Upload at least one image').max(10, 'Maximum 10 images allowed'),
}).refine(
    (data) => {
        if (data.floorNumber !== undefined && data.totalFloors !== undefined) {
            return data.floorNumber <= data.totalFloors;
        }
        return true;
    },
    {
        message: 'Floor number cannot be greater than total floors',
        path: ['floorNumber'],
    }
);

export type PropertyFormData = z.infer<typeof propertySchema>;

// Login validation
export const loginSchema = z.object({
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

// Signup validation
export const signupSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(50, 'Name must be less than 50 characters'),
    email: z.string().email('Please enter a valid email address'),
    phone: z.string().regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit mobile number'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string(),
    userType: z.enum(['owner', 'tenant'], {
        errorMap: () => ({ message: 'Please select account type' }),
    }),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
});

export type SignupFormData = z.infer<typeof signupSchema>;

// Password reset request validation
export const forgotPasswordSchema = z.object({
    email: z.string().email('Please enter a valid email address'),
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

// Password reset validation
export const resetPasswordSchema = z.object({
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
});

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

// Inquiry form validation
export const inquirySchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    phone: z.string().regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit mobile number'),
    message: z.string().min(10, 'Message must be at least 10 characters').max(500, 'Message must be less than 500 characters'),
    propertyId: z.string(),
    moveInDate: z.string().optional(),
});

export type InquiryFormData = z.infer<typeof inquirySchema>;

// Message validation
export const messageSchema = z.object({
    receiverId: z.string().min(1, 'Receiver is required'),
    content: z.string().min(1, 'Message cannot be empty').max(1000, 'Message must be less than 1000 characters'),
    propertyId: z.string().optional(),
});

export type MessageFormData = z.infer<typeof messageSchema>;

// Profile update validation
export const profileUpdateSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(50, 'Name must be less than 50 characters'),
    phone: z.string().regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit mobile number').optional(),
    bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
    avatar: z.string().url('Invalid avatar URL').optional(),
});

export type ProfileUpdateFormData = z.infer<typeof profileUpdateSchema>;

// Search filters validation
export const searchFiltersSchema = z.object({
    city: z.string().optional(),
    area: z.string().optional(),
    propertyType: z.enum(['PG', 'Co-living', 'Rent', 'All']).optional(),
    roomType: z.enum(['Single', 'Double', 'Triple', 'Four Sharing', 'Apartment', '1RK', 'All']).optional(),
    minPrice: z.number().min(0).optional(),
    maxPrice: z.number().min(0).optional(),
    amenities: z.array(z.string()).optional(),
    furnishing: z.enum(['Fully Furnished', 'Semi Furnished', 'Unfurnished', 'All']).optional(),
    preferredTenant: z.enum(['Male', 'Female', 'Any', 'All']).optional(),
}).refine(
    (data) => {
        if (data.minPrice !== undefined && data.maxPrice !== undefined) {
            return data.minPrice <= data.maxPrice;
        }
        return true;
    },
    {
        message: 'Minimum price cannot be greater than maximum price',
        path: ['maxPrice'],
    }
);

export type SearchFiltersFormData = z.infer<typeof searchFiltersSchema>;
