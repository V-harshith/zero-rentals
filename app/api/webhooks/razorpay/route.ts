import { NextRequest, NextResponse } from 'next/server'
import { validateWebhookSignature } from '@/lib/payment-service'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
    const body = await req.text()
    const signature = req.headers.get('x-razorpay-signature')

    if (!signature) {
        return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
    }

    // 🔥 CRITICAL FIX: Validate environment variable exists
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
    if (!webhookSecret) {
        console.error('RAZORPAY_WEBHOOK_SECRET not configured!')
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const isValid = validateWebhookSignature(body, signature, webhookSecret)

    if (!isValid) {
        console.warn('Invalid webhook signature received')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const event = JSON.parse(body)

    // Handle order.paid event
    if (event.event === 'order.paid') {
        const order = event.payload.order.entity
        const notes = order.notes
        const userId = notes.userId
        const planName = notes.planName
        const duration = notes.duration
        const amount = order.amount / 100 // Convert from paise
        const orderId = order.id

        await fulfillSubscription(userId, planName, duration, amount, orderId)
    }

    return NextResponse.json({ received: true })
}

async function fulfillSubscription(
    userId: string,
    planName: string,
    duration: string,
    amount: number,
    orderId: string
) {
    try {
        // 🔥 CRITICAL FIX: Check idempotency FIRST with proper error handling
        const { data: existing, error: checkError } = await supabaseAdmin
            .from('payment_logs')
            .select('id')
            .eq('transaction_id', orderId)
            .maybeSingle()

        if (checkError) {
            console.error('Error checking payment logs:', checkError)
            throw checkError
        }

        if (existing) {
            console.log('Payment already processed (idempotency check):', orderId)
            return
        }

        // 🔥 CRITICAL FIX: Proper date handling with UTC
        const startDate = new Date()
        const endDate = new Date()

        // 🔥 CRITICAL FIX: Improved duration parsing
        const durationLower = duration.toLowerCase()
        if (durationLower.includes('month')) {
            const months = parseInt(duration.match(/\d+/)?.[0] || '3')
            endDate.setUTCMonth(endDate.getUTCMonth() + months)
        } else if (durationLower.includes('year')) {
            const years = parseInt(duration.match(/\d+/)?.[0] || '1')
            endDate.setUTCFullYear(endDate.getUTCFullYear() + years)
        } else {
            // Fallback to plan name
            if (planName === 'Silver') endDate.setUTCMonth(endDate.getUTCMonth() + 3)
            else if (planName === 'Gold') endDate.setUTCMonth(endDate.getUTCMonth() + 6)
            else if (planName === 'Platinum') endDate.setUTCFullYear(endDate.getUTCFullYear() + 1)
            else endDate.setUTCMonth(endDate.getUTCMonth() + 1) // Default 1 month
        }

        // Map properties limit
        const limitMap: Record<string, number> = {
            'Free': 1,
            'Silver': 3,
            'Gold': 5,
            'Platinum': 10,
            'Elite': 20
        }
        const propertiesLimit = limitMap[planName] || 1

        // 🔥 CRITICAL FIX: Use transaction-like approach
        // Cancel existing active subscriptions
        await supabaseAdmin
            .from('subscriptions')
            .update({ status: 'cancelled' })
            .eq('user_id', userId)
            .eq('status', 'active')

        // Create new subscription
        const { data: subscription, error: subError } = await supabaseAdmin
            .from('subscriptions')
            .insert([{
                user_id: userId,
                plan_name: planName,
                plan_duration: duration,
                amount: amount,
                status: 'active',
                properties_limit: propertiesLimit,
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString()
            }])
            .select()
            .single()

        if (subError) throw subError

        // 🔥 NEW: Auto-feature existing properties if plan allows
        const { getTierFeatures } = await import('@/lib/subscription-service')
        const planFeatures = {
            'FREE': { featuredBadge: false },
            'SILVER': { featuredBadge: true },
            'GOLD': { featuredBadge: true },
            'PLATINUM': { featuredBadge: true },
            'ELITE': { featuredBadge: true }
        }
        const currentTierFeatures = planFeatures[planName.toUpperCase() as keyof typeof planFeatures]

        if (currentTierFeatures?.featuredBadge) {
            console.log('Auto-featuring existing properties for user:', userId)
            await supabaseAdmin
                .from('properties')
                .update({ featured: true })
                .eq('owner_id', userId)
                .in('status', ['active', 'pending'])
        }

        // Create payment log (with unique constraint to prevent duplicates)
        await supabaseAdmin
            .from('payment_logs')
            .insert([{
                user_id: userId,
                subscription_id: subscription.id,
                amount: amount,
                transaction_id: orderId,
                status: 'success',
                payment_gateway: 'razorpay'
            }])

        // Send email notification
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('email, name')
            .eq('id', userId)
            .maybeSingle()

        if (user) {
            const { sendPaymentSuccessEmail } = await import('@/lib/email-service')
            await sendPaymentSuccessEmail({
                email: user.email,
                name: user.name,
                planName: planName,
                amount: amount,
                transactionId: orderId,
                endDate: endDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })
            })
        }

    } catch (error) {
        console.error('Webhook Fulfillment Error:', error)
        // Re-throw to let Razorpay retry
        throw error
    }
}
