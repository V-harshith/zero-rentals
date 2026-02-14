'use server'

import { sendVerificationEmail } from "@/lib/email-service"

export async function sendVerificationEmailAction(
    email: string,
    name: string,
    token: string,
    role: 'owner' | 'tenant' | 'admin' = 'tenant'
) {
    if (!email || !email.includes('@')) {
        return { success: false, error: "Invalid email address" }
    }
    try {
        await sendVerificationEmail(email, name, token, role)
        return { success: true }
    } catch (error) {
        console.error("Server Action Error:", error)
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
    }
}

export async function forgotPasswordAction(email: string) {
    if (!email || !email.includes('@')) {
        return { success: false, error: "Invalid email address" }
    }

    try {
        const { supabaseAdmin } = await import("@/lib/supabase-admin")
        const { sendPasswordResetEmail } = await import("@/lib/email-service")

        // 1. Check if user exists and get their name
        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .select('name')
            .eq('email', email)
            .maybeSingle()

        if (userError) {
            console.error('[FORGOT_PASSWORD] Database error:', userError.message)
            throw new Error('Service temporarily unavailable. Please try again later.')
        }

        // SECURITY: If user doesn't exist, still return success to prevent email enumeration
        if (!user) {
            console.log(`[FORGOT_PASSWORD] Email not found: ${email}`)
            return { success: true }
        }

        // 2. Generate recovery link with proper redirect URL
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

        console.log(`[FORGOT_PASSWORD] Generating recovery link for: ${email}`)

        const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: email,
            options: {
                redirectTo: `${baseUrl}/reset-password`
            }
        })

        if (linkError) {
            console.error('[FORGOT_PASSWORD] Generate link error:', linkError.message)
            throw new Error('Failed to generate reset link. Please try again later.')
        }

        // 3. Send custom branded email via Resend
        if (data?.properties?.action_link) {
            console.log(`[FORGOT_PASSWORD] Sending email to: ${email}`)
            await sendPasswordResetEmail(email, user.name, data.properties.action_link)
            console.log(`[FORGOT_PASSWORD] Email sent successfully to: ${email}`)
        } else {
            console.error('[FORGOT_PASSWORD] No action_link in response')
            throw new Error('Failed to create reset link. Please try again later.')
        }

        return { success: true }
    } catch (error: any) {
        console.error("[FORGOT_PASSWORD] Action Error:", error.message || error)
        // Return user-friendly error for UI display
        return { success: false, error: error.message || "Failed to send reset email. Please try again later." }
    }
}
export async function deleteAccountAction(userId: string) {
    if (!userId) return { success: false, error: "User ID required" }

    try {
        const { supabaseAdmin } = await import("@/lib/supabase-admin")

        // 1. Delete from public.users (cascades to properties, etc.)
        const { error: publicError } = await supabaseAdmin
            .from('users')
            .delete()
            .eq('id', userId)

        if (publicError) throw publicError

        // 2. Delete from auth.users
        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)

        if (authError) {
            console.error("Auth Deletion Error:", authError)
            // Even if auth fails, the public record is gone. 
            // This might happen if user is already deleted or session token is invalid.
        }

        return { success: true }
    } catch (error) {
        console.error("Delete Account Action Error:", error)
        return { success: false, error: error instanceof Error ? error.message : "Failed to delete account" }
    }
}
