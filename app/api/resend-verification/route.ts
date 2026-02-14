import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateVerificationToken, getTokenExpiry } from '@/lib/verification-utils'
import { sendVerificationEmail } from '@/lib/email-service'
import { rateLimit } from '@/lib/rate-limit'

// Use service role key for admin operations
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
    try {
        const { email } = await request.json()

        if (!email) {
            return NextResponse.json(
                { error: 'Email is required' },
                { status: 400 }
            )
        }

        // Rate limit by email
        const { success } = await rateLimit(`resend-${email}`, 3, 60000)
        if (!success) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again in a minute.' },
                { status: 429 }
            )
        }

        // Find user
        const { data: user, error } = await supabase
            .from('users')
            .select('id, email, name, role, email_verified_at')
            .eq('email', email)
            .maybeSingle()

        if (error || !user) {
            // Don't reveal if email exists (security)
            return NextResponse.json(
                { message: 'If the email exists, a verification link has been sent.' },
                { status: 200 }
            )
        }

        // Check if already verified
        if (user.email_verified_at) {
            return NextResponse.json(
                { error: 'Email already verified' },
                { status: 400 }
            )
        }

        // Generate new token
        const verificationToken = generateVerificationToken()
        const tokenExpiresAt = getTokenExpiry()

        // Update user with new token
        const { error: updateError } = await supabase
            .from('users')
            .update({
                verification_token: verificationToken,
                token_expires_at: tokenExpiresAt.toISOString(),
            })
            .eq('id', user.id)

        if (updateError) {
            console.error('Update error:', updateError)
            throw updateError
        }

        // Send email with role-specific template
        try {
            await sendVerificationEmail(user.email, user.name, verificationToken, user.role as 'owner' | 'tenant' | 'admin')
            console.log(`Verification email resent to: ${user.email}`)
        } catch (emailError) {
            console.error('Email send error:', emailError)
            return NextResponse.json(
                { error: 'Failed to send verification email' },
                { status: 500 }
            )
        }

        return NextResponse.json(
            { message: 'Verification email sent successfully' },
            { status: 200 }
        )
    } catch (error) {
        console.error('Resend verification error:', error)
        return NextResponse.json(
            { error: 'Failed to resend verification email' },
            { status: 500 }
        )
    }
}
