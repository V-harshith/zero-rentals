import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { PLAN_FEATURES } from '@/lib/constants'
import { handleCancelledToRenewed } from '@/lib/subscription-service-server'

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

        // Idempotency Check: Prevent duplicate processing with row locking pattern
        // First check if payment already processed
        const { data: existingPayment, error: paymentCheckError } = await supabaseAdmin
            .from('payment_logs')
            .select('id, status, subscription_id')
            .eq('transaction_id', razorpay_payment_id)
            .maybeSingle()

        if (paymentCheckError) {
            console.error('Error checking payment status:', paymentCheckError)
        }

        if (existingPayment?.status === 'success') {
            // Payment already processed, return existing subscription
            const { data: existingSub } = await supabaseAdmin
                .from('subscriptions')
                .select('*')
                .eq('id', existingPayment.subscription_id)
                .maybeSingle()

            if (existingSub) {
                return NextResponse.json({
                    success: true,
                    subscription: existingSub,
                    message: 'Payment already processed'
                })
            }
        }

        // Check if there's a pending payment log for this order that we should update
        // Use upsert pattern to handle race conditions
        const { data: paymentLog, error: upsertError } = await supabaseAdmin
            .from('payment_logs')
            .upsert({
                user_id: user.id,
                transaction_id: razorpay_payment_id,
                status: 'processing',
                amount: planDetails.amount,
                currency: 'INR',
                payment_gateway: 'Razorpay',
                payment_method: 'razorpay',
                order_id: razorpay_order_id,
            }, {
                onConflict: 'transaction_id',
                ignoreDuplicates: false
            })
            .select()
            .single()

        if (upsertError) {
            console.error('Failed to create/update payment log:', upsertError)
        }

        // Double-check idempotency after upsert (another request may have completed)
        const { data: currentPayment } = await supabaseAdmin
            .from('payment_logs')
            .select('id, status, subscription_id')
            .eq('transaction_id', razorpay_payment_id)
            .single()

        if (currentPayment?.status === 'success' && currentPayment.subscription_id) {
            const { data: existingSub } = await supabaseAdmin
                .from('subscriptions')
                .select('*')
                .eq('id', currentPayment.subscription_id)
                .single()

            return NextResponse.json({
                success: true,
                subscription: existingSub,
                message: 'Payment already processed'
            })
        }

        // 🔥 STATE MACHINE FIX: Use proper state machine for cancelled -> renewed transition
        const propertiesLimit = planDetails.propertiesLimit === 'Unlimited properties'
            ? 999
            : parseInt(planDetails.propertiesLimit.replace(/\D/g, '')) || 1

        const result = await handleCancelledToRenewed(user.id, {
            planName: planDetails.planName,
            duration: planDetails.duration,
            amount: planDetails.amount,
            propertiesLimit
        })

        if (!result.success) {
            console.error('Subscription creation failed:', result.error)
            return NextResponse.json(
                { error: 'Failed to activate subscription. Please contact support.' },
                { status: 500 }
            )
        }

        // Get the full subscription details
        const { data: subscription, error: subError } = await supabaseAdmin
            .from('subscriptions')
            .select('*')
            .eq('id', result.subscription!.id)
            .single()

        if (subError) {
            console.error('Failed to fetch subscription:', subError)
            return NextResponse.json(
                { error: 'Failed to retrieve subscription details.' },
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

        // Update Payment Log with subscription reference
        // Use upsert to ensure idempotency
        const { error: updateError } = await supabaseAdmin
            .from('payment_logs')
            .upsert({
                id: paymentLog?.id,
                user_id: user.id,
                subscription_id: subscription.id,
                amount: planDetails.amount,
                currency: 'INR',
                payment_gateway: 'Razorpay',
                transaction_id: razorpay_payment_id,
                order_id: razorpay_order_id,
                status: 'success',
                payment_method: 'razorpay',
                processed_at: new Date().toISOString()
            }, {
                onConflict: 'transaction_id',
                ignoreDuplicates: false
            })

        if (updateError) {
            console.warn('Could not update payment log:', updateError)
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
