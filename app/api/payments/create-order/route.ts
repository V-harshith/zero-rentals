import { NextRequest, NextResponse } from 'next/server'
import { createRazorpayOrder } from '@/lib/razorpay'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
    try {
        const { planName, amount, duration, propertiesLimit } = await request.json()

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

        // Amount in paise (multiply by 100)
        const amountInPaise = Math.round(amount * 100)

        // Create Razorpay Order
        const order = await createRazorpayOrder({
            amount: amountInPaise,
            currency: 'INR',
            receipt: `rcpt_${Date.now()}_${user.id.substring(0, 4)}`,
            notes: {
                userId: user.id,
                planName,
                duration,
                propertiesLimit: String(propertiesLimit)
            }
        })

        // Create service role client to bypass RLS for creating payment log if needed
        // (Though standard client should work if policies logic is correct, but safer for system logs)
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
        const { error: logError } = await supabaseAdmin
            .from('payment_logs')
            .insert({
                user_id: user.id,
                amount: amount,
                currency: 'INR',
                payment_gateway: 'Razorpay',
                transaction_id: order.id, // Using order ID initially
                status: 'pending',
                payment_method: 'unknown', // Will be updated on success
            })

        if (logError) {
            console.error('Error logging payment:', logError)
            // We continue anyway, as the order was created
        }

        return NextResponse.json({
            orderId: order.id,
            amount: amountInPaise,
            currency: 'INR',
            keyId: process.env.RAZORPAY_KEY_ID
        })

    } catch (error: any) {
        console.error('Create Order Error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to create order' },
            { status: 500 }
        )
    }
}
