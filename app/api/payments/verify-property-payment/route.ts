import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            plan,
            days
        } = await request.json()

        // Verify signature
        const body = razorpay_order_id + "|" + razorpay_payment_id
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
            .update(body.toString())
            .digest("hex")

        const isAuthenticated = expectedSignature === razorpay_signature

        if (!isAuthenticated) {
            return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 })
        }

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

        // Create admin client
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

        // 🔒 CRITICAL: Check for replay attack - verify transaction_id hasn't been used
        const { data: existingPayment } = await supabaseAdmin
            .from('payment_logs')
            .select('id, status')
            .eq('transaction_id', razorpay_payment_id)
            .maybeSingle()

        if (existingPayment) {
            return NextResponse.json(
                { error: 'Payment already processed' },
                { status: 400 }
            )
        }

        // Also check if transaction_id is already used for another property
        const { data: existingPropertyPayment } = await supabaseAdmin
            .from('properties')
            .select('id')
            .eq('payment_transaction_id', razorpay_payment_id)
            .maybeSingle()

        if (existingPropertyPayment) {
            return NextResponse.json(
                { error: 'Payment already used for another property' },
                { status: 400 }
            )
        }

        // Update payment log
        await supabaseAdmin
            .from('payment_logs')
            .update({
                status: 'completed',
                payment_method: 'razorpay',
                transaction_id: razorpay_payment_id
            })
            .eq('transaction_id', razorpay_order_id)

        // Calculate expiry date
        const expiryDate = new Date()
        expiryDate.setDate(expiryDate.getDate() + parseInt(days))

        // Store payment details for property creation
        // These will be used when the property is actually created
        const paymentToken = crypto.randomBytes(32).toString('hex')
        
        // Store in a temporary table or session
        // For simplicity, we'll return the payment details to be included in property creation
        return NextResponse.json({
            success: true,
            message: 'Payment verified successfully',
            propertyPayment: {
                transactionId: razorpay_payment_id,
                plan: plan,
                expiresAt: expiryDate.toISOString(),
                amount: null, // Will be fetched from payment_logs if needed
                token: paymentToken
            }
        })

    } catch (error: any) {
        console.error('Verify Property Payment Error:', error)
        return NextResponse.json(
            { error: error.message || 'Payment verification failed' },
            { status: 500 }
        )
    }
}
