import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { PLAN_FEATURES } from '@/lib/constants'

export async function POST(request: NextRequest) {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            planDetails
        } = await request.json()

        // Validate required fields
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !planDetails) {
            return NextResponse.json(
                { error: 'Missing required payment details' },
                { status: 400 }
            )
        }

        // Verify Signature
        const body = razorpay_order_id + "|" + razorpay_payment_id
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
            .update(body.toString())
            .digest("hex")

        const isAuthenticated = expectedSignature === razorpay_signature

        if (!isAuthenticated) {
            return NextResponse.json(
                { error: 'Invalid Payment Signature' },
                { status: 400 }
            )
        }

        // Get auth user
        const cookieStore = await cookies()
        // Use service role to write to subscriptions table securely
        const supabaseAdmin = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                cookies: {
                    get(name: string) { return cookieStore.get(name)?.value },
                    set() { },
                    remove() { },
                },
            }
        )

        const { data: { user } } = await supabaseAdmin.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        // Idempotency Check: Prevent duplicate processing
        const { data: existingPayment } = await supabaseAdmin
            .from('payment_logs')
            .select('id, status')
            .eq('transaction_id', razorpay_payment_id)
            .maybeSingle()

        if (existingPayment?.status === 'success') {
            // Payment already processed, return existing subscription
            const { data: existingSub } = await supabaseAdmin
                .from('subscriptions')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

            return NextResponse.json({
                success: true,
                subscription: existingSub,
                message: 'Payment already processed'
            })
        }

        // Activate Subscription
        const startDate = new Date()
        const endDate = new Date()

        // Parse duration more robustly
        const durationStr = planDetails.duration || ''
        const monthMatch = durationStr.match(/(\d+)\s*Month/i)
        const yearMatch = durationStr.match(/(\d+)\s*Year/i)

        if (monthMatch) {
            const months = parseInt(monthMatch[1], 10)
            endDate.setMonth(endDate.getMonth() + months)
        } else if (yearMatch) {
            const years = parseInt(yearMatch[1], 10)
            endDate.setFullYear(endDate.getFullYear() + years)
        } else {
            // Default 1 month
            endDate.setMonth(endDate.getMonth() + 1)
        }

        // Deactivate any existing active subscription first
        await supabaseAdmin
            .from('subscriptions')
            .update({ status: 'expired' })
            .eq('user_id', user.id)
            .eq('status', 'active')

        // Create new subscription
        const { data: subscription, error: subError } = await supabaseAdmin
            .from('subscriptions')
            .insert({
                user_id: user.id,
                plan_name: planDetails.planName,
                plan_duration: planDetails.duration,
                amount: planDetails.amount,
                status: 'active',
                properties_limit: planDetails.propertiesLimit === 'Unlimited properties' ? 999 : parseInt(planDetails.propertiesLimit.replace(/\D/g, '')) || 1,
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString()
            })
            .select()
            .single()

        if (subError) {
            console.error('Subscription creation failed:', subError)
            return NextResponse.json(
                { error: 'Failed to activate subscription. Please contact support.' },
                { status: 500 }
            )
        }

        // Update Properties to Featured if Plan Allows (best effort)
        const featureParams = PLAN_FEATURES[planDetails.planName?.toUpperCase() as keyof typeof PLAN_FEATURES]
        if (featureParams?.featuredBadge) {
            const { error: featError } = await supabaseAdmin
                .from('properties')
                .update({ featured: true })
                .eq('owner_id', user.id)
                .eq('status', 'active')

            if (featError) {
                console.error('Failed to update properties to featured:', featError)
                // Don't fail the request - subscription is already created
            }
        }

        // Update Payment Log (best effort)
        const { error: updateError } = await supabaseAdmin
            .from('payment_logs')
            .update({
                status: 'success',
                subscription_id: subscription.id,
                payment_method: 'razorpay',
                transaction_id: razorpay_payment_id
            })
            .eq('transaction_id', razorpay_order_id)

        if (updateError) {
            console.warn('Could not update pending log:', updateError)
            // Insert success log as fallback
            Promise.resolve(supabaseAdmin
                .from('payment_logs')
                .insert({
                    user_id: user.id,
                    subscription_id: subscription.id,
                    amount: planDetails.amount,
                    currency: 'INR',
                    payment_gateway: 'Razorpay',
                    transaction_id: razorpay_payment_id,
                    status: 'success',
                    payment_method: 'razorpay'
                })
            ).catch(err => console.error('Failed to insert payment log:', err))
        }

        // Send Success Email (fire and forget, don't block response)
        const { sendPaymentSuccessEmail } = await import('@/lib/email-service')
        sendPaymentSuccessEmail({
            email: user.email!,
            name: user.user_metadata?.name || 'Valued Customer',
            planName: planDetails.planName,
            amount: planDetails.amount,
            transactionId: razorpay_payment_id,
            endDate: new Date(subscription.end_date).toLocaleDateString()
        }).catch(err => console.error('Failed to send payment success email:', err))

        return NextResponse.json({ success: true, subscription })

    } catch (error) {
        console.error('Payment Verification Error:', error)
        // Sanitize error message
        return NextResponse.json(
            { error: 'Payment verification failed. Please contact support if payment was deducted.' },
            { status: 500 }
        )
    }
}
