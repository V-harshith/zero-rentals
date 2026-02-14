import { NextRequest, NextResponse } from 'next/server'
import { createRazorpayOrder } from '@/lib/razorpay'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Property payment pricing (same as subscription plans)
const PROPERTY_PRICING = {
    '1_month': { amount: 1000, label: '1 Month', days: 30 },
    '3_months': { amount: 2700, label: '3 Months', days: 90 },
    '6_months': { amount: 5000, label: '6 Months', days: 180 },
    '12_months': { amount: 9000, label: '12 Months', days: 365 },
} as const

export async function POST(request: NextRequest) {
    try {
        const { plan } = await request.json()

        // Validate plan
        if (!plan || !PROPERTY_PRICING[plan as keyof typeof PROPERTY_PRICING]) {
            return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 })
        }

        const planDetails = PROPERTY_PRICING[plan as keyof typeof PROPERTY_PRICING]

        // Get authenticated user
        const cookieStore = await cookies()
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) {
                        return cookieStore.get(name)?.value
                    },
                },
            }
        )

        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Check if user has an active subscription (required for property payments)
        const { data: subscription } = await supabase
            .from('subscriptions')
            .select('status, plan_name')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .gt('end_date', new Date().toISOString())
            .maybeSingle()

        if (!subscription) {
            return NextResponse.json(
                { error: 'Active subscription required. Please upgrade first.' },
                { status: 403 }
            )
        }

        // Amount in paise (multiply by 100)
        const amountInPaise = Math.round(planDetails.amount * 100)

        // Create Razorpay Order
        const order = await createRazorpayOrder({
            amount: amountInPaise,
            currency: 'INR',
            receipt: `prop_${Date.now()}_${user.id.substring(0, 4)}`,
            notes: {
                userId: user.id,
                type: 'property_payment',
                plan: plan,
                days: String(planDetails.days)
            }
        })

        // Create service role client for payment log
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

        // Log the pending payment
        await supabaseAdmin
            .from('payment_logs')
            .insert({
                user_id: user.id,
                amount: planDetails.amount,
                currency: 'INR',
                payment_gateway: 'Razorpay',
                transaction_id: order.id,
                status: 'pending',
                payment_method: 'unknown',
                metadata: {
                    type: 'property_payment',
                    plan: plan,
                    days: planDetails.days
                }
            })

        return NextResponse.json({
            orderId: order.id,
            amount: amountInPaise,
            currency: 'INR',
            keyId: process.env.RAZORPAY_KEY_ID,
            plan: plan,
            days: planDetails.days
        })

    } catch (error: any) {
        console.error('Create Property Order Error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to create order' },
            { status: 500 }
        )
    }
}
