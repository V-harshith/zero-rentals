import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateVerificationToken } from '@/lib/verification-utils'
import { sendVerificationEmailAction } from '@/app/actions/auth-actions'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { email } = body

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 })
        }

        // 1. Fetch user to check status and get name
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single()

        if (userError || !user) {
            // Ensure we don't leak email existence, but for now we need debugging
            console.error('Resend verification: User not found', email)
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        if (user.verified) {
            return NextResponse.json({ message: 'Email already verified' }, { status: 200 })
        }

        // 2. Generate new token
        const verificationToken = generateVerificationToken()

        // 3. Update user with new token
        const { error: updateError } = await supabase
            .from('users')
            .update({
                verification_token: verificationToken,
                token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
            })
            .eq('id', user.id)

        if (updateError) {
            console.error('Resend verification: Failed to update token', updateError)
            return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 })
        }

        // 4. Send email
        const emailResult = await sendVerificationEmailAction(email, user.name, verificationToken)

        if (!emailResult.success) {
            console.error('Resend verification: Failed to send email', emailResult.error)
            return NextResponse.json({ error: 'Failed to send verification email' }, { status: 500 })
        }

        return NextResponse.json({ message: 'Verification email sent' })
    } catch (error: any) {
        console.error('Resend verification error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
