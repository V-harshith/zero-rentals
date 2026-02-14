import { z } from "zod"

export const personalInfoSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    phone: z.string().regex(/^\d{10}$/, "Phone number must be exactly 10 digits").optional().or(z.literal("")),
    city: z.string().min(2, "City is required").optional().or(z.literal("")),
})

export const businessDetailsSchema = z.object({
    businessName: z.string().min(2, "Business name is required").optional().or(z.literal("")),
    gstNumber: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, "Invalid GST Number").optional().or(z.literal("")),
    address: z.string().min(5, "Address must be at least 5 characters").optional().or(z.literal("")),
})

export const bankDetailsSchema = z.object({
    bankName: z.string().min(2, "Bank name is required").optional().or(z.literal("")),
    accountNumber: z.string().min(9, "Account number must be 9-18 digits").max(18).optional().or(z.literal("")),
    ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC Code").optional().or(z.literal("")),
    accountHolderName: z.string().min(2, "Account holder name is required").optional().or(z.literal("")),
})

export const tenantPreferencesSchema = z.object({
    preferredLocations: z.string().optional().or(z.literal("")),
    budgetMin: z.string().optional().or(z.literal("")),
    budgetMax: z.string().optional().or(z.literal("")),
    preferredRoomType: z.enum(["Single", "Double Sharing", "Triple Sharing", "Four Sharing"]).optional(),
    moveInDate: z.string().optional().or(z.literal("")),
})

export const passwordChangeSchema = z.object({
    currentPassword: z.string().min(6, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
}).refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
})
