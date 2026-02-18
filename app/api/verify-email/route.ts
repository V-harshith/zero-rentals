import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isTokenExpired } from '@/lib/verification-utils'

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const token = searchParams.get('token')

    if (!token) {
        return NextResponse.redirect(
            new URL('/auth/verification-failed?reason=missing_token', request.url)
        )
    }

    try {
        // Find user with this token
        const { data: user, error } = await supabaseAdmin
            .from('users')
            .select('id, email, name, role, token_expires_at, email_verified_at')
            .eq('verification_token', token)
            .maybeSingle()

        if (error) {
            console.error('Database error during token lookup:', error)
            return NextResponse.redirect(
                new URL('/auth/verification-failed?reason=server_error', request.url)
            )
        }

        if (!user) {
            console.error('No user found with token')
            return NextResponse.redirect(
                new URL('/auth/verification-failed?reason=invalid_token', request.url)
            )
        }

        // Check if already verified
        if (user.email_verified_at) {
            // Redirect already verified users to their dashboard
            const roleRedirectMap: Record<string, string> = {
                owner: '/dashboard/owner',
                tenant: '/dashboard/tenant',
                admin: '/dashboard/admin'
            }
            const redirectUrl = roleRedirectMap[user.role] || '/login'
            return NextResponse.redirect(
                new URL(`/auth/already-verified?redirect=${encodeURIComponent(redirectUrl)}`, request.url)
            )
        }

        // Check if token expired
        if (isTokenExpired(user.token_expires_at)) {
            return NextResponse.redirect(
                new URL(`/auth/verification-failed?reason=expired&email=${encodeURIComponent(user.email)}`, request.url)
            )
        }

        // CRITICAL: Update Supabase Auth status so they can actually login
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
            user.id,
            { email_confirm: true }
        )

        if (authError) {
            console.error('Failed to confirm email in Supabase Auth:', authError)
            throw authError
        }

        // Mark as verified
        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({
                verified: true,
                email_verified_at: new Date().toISOString(),
                verification_token: null,
                token_expires_at: null,
            })
            .eq('id', user.id)

        if (updateError) {
            console.error('Update error:', updateError)
            throw updateError
        }

        console.log(`Email verified successfully for user: ${user.email} (${user.role})`)

        // Redirect to role-specific dashboard
        const roleRedirectMap: Record<string, string> = {
            owner: '/dashboard/owner',
            tenant: '/dashboard/tenant',
            admin: '/dashboard/admin'
        }
        const dashboardUrl = roleRedirectMap[user.role] || '/login'

        // Redirect to success page with role info for proper navigation
        return NextResponse.redirect(
            new URL(`/auth/verified?role=${user.role}&redirect=${encodeURIComponent(dashboardUrl)}`, request.url)
        )
    } catch (error) {
        console.error('Verification error:', error)
        return NextResponse.redirect(
            new URL('/auth/verification-failed?reason=server_error', request.url)
        )
    }
}
