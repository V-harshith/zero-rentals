import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'
import crypto from 'crypto'

// Initialize Razorpay lazily to prevent build-time errors
let razorpayInstance: any = null

const getRazorpay = () => {
    if (razorpayInstance) return razorpayInstance

    const key_id = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
    const key_secret = process.env.RAZORPAY_KEY_SECRET

    if (!key_id || !key_secret) {
        console.warn('RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set')
        return null
    }

    try {
        const Razorpay = require('razorpay')
        razorpayInstance = new Razorpay({
            key_id: key_id,
            key_secret: key_secret,
        })
        return razorpayInstance
    } catch (error) {
        console.error('Failed to initialize Razorpay:', error)
        return null
    }
}

/**
 * POST /api/admin/refunds
 * Process a refund with idempotency protection against double refunds
 *
 * Request body:
 * {
 *   paymentId: string,        // Internal payment_logs.id
 *   amount?: number,          // Optional: partial refund amount (in rupees)
 *   reason?: string,          // Reason for refund
 *   idempotencyKey?: string   // Optional: client-provided idempotency key
 * }
 */
export async function POST(request: NextRequest) {
    // Generate server-side idempotency key for this request
    const requestId = crypto.randomUUID()
    const startTime = Date.now()

    try {
        // CSRF Protection
        const csrfCheck = await csrfProtection(request)
        if (!csrfCheck.valid) {
            return NextResponse.json(
                { error: csrfCheck.error || 'Invalid request' },
                { status: 403 }
            )
        }

        // Rate limiting: 10 refunds per hour per admin
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                         request.headers.get('x-real-ip') ||
                         'unknown'
        const rateLimitKey = `admin:refund:${clientIp}`
        const rateLimitResult = await rateLimit(rateLimitKey, 10, 60 * 60 * 1000)
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again later.' },
                { status: 429 }
            )
        }

        // Parse and validate request body
        const body = await request.json()
        const { paymentId, amount, reason, idempotencyKey: clientIdempotencyKey } = body

        if (!paymentId) {
            return NextResponse.json(
                { error: 'Payment ID is required' },
                { status: 400 }
            )
        }

        // Generate composite idempotency key (client-provided or server-generated)
        const idempotencyKey = clientIdempotencyKey
            ? `client:${clientIdempotencyKey}`
            : `server:${paymentId}:${amount || 'full'}:${requestId}`

        // 1. Verify Authentication & Admin Role
        const supabase = await createClient()
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: userProfile, error: profileError } = await supabase
            .from('users')
            .select('role')
            .eq('id', authUser.id)
            .maybeSingle()

        if (profileError || !userProfile || userProfile.role !== 'admin') {
            return NextResponse.json(
                { error: 'Forbidden: Admin access required' },
                { status: 403 }
            )
        }

        // 2. IDEMPOTENCY CHECK: Check if refund already processed with this key
        const { data: existingRefund, error: existingRefundError } = await supabaseAdmin
            .from('refunds')
            .select('id, status, amount, razorpay_refund_id, processed_at, payment_id')
            .eq('idempotency_key', idempotencyKey)
            .maybeSingle()

        if (existingRefundError) {
            console.error('[REFUND] Error checking idempotency:', existingRefundError)
        }

        // If refund already processed successfully, return cached result
        if (existingRefund?.status === 'completed') {
            console.log(`[REFUND] Idempotency hit: Refund already processed for key ${idempotencyKey}`)
            return NextResponse.json({
                success: true,
                message: 'Refund already processed',
                refund: existingRefund,
                idempotencyKey,
                cached: true
            })
        }

        // If refund is currently processing, return conflict
        if (existingRefund?.status === 'processing') {
            return NextResponse.json({
                success: false,
                message: 'Refund is currently being processed',
                refund: existingRefund,
                idempotencyKey,
                retryAfter: 5
            }, { status: 409 })
        }

        // 3. Fetch payment record with locking pattern (check for existing refunds)
        const { data: payment, error: paymentError } = await supabaseAdmin
            .from('payment_logs')
            .select('id, transaction_id, amount, status, user_id, subscription_id, currency')
            .eq('id', paymentId)
            .maybeSingle()

        if (paymentError) {
            console.error('[REFUND] Error fetching payment:', paymentError)
            return NextResponse.json(
                { error: 'Failed to fetch payment record' },
                { status: 500 }
            )
        }

        if (!payment) {
            return NextResponse.json(
                { error: 'Payment not found' },
                { status: 404 }
            )
        }

        // Validate payment can be refunded
        if (payment.status !== 'success') {
            return NextResponse.json(
                { error: `Cannot refund payment with status: ${payment.status}` },
                { status: 400 }
            )
        }

        // 4. Check for any existing refunds on this payment (prevent double refund)
        const { data: existingPaymentRefunds, error: existingPaymentRefundsError } = await supabaseAdmin
            .from('refunds')
            .select('id, status, amount, razorpay_refund_id')
            .eq('payment_id', paymentId)
            .in('status', ['completed', 'processing'])

        if (existingPaymentRefundsError) {
            console.error('[REFUND] Error checking existing refunds:', existingPaymentRefundsError)
        }

        // Calculate total already refunded
        const totalRefunded = existingPaymentRefunds?.reduce((sum, r) => {
            return r.status === 'completed' ? sum + (r.amount || 0) : sum
        }, 0) || 0

        // Determine refund amount (in paise for Razorpay)
        const refundAmountRupees = amount || payment.amount
        const refundAmountPaise = Math.round(refundAmountRupees * 100)
        const paymentAmountPaise = payment.amount * 100

        // Validate refund amount
        if (refundAmountPaise <= 0) {
            return NextResponse.json(
                { error: 'Refund amount must be greater than 0' },
                { status: 400 }
            )
        }

        if (refundAmountPaise > paymentAmountPaise) {
            return NextResponse.json(
                { error: 'Refund amount cannot exceed payment amount' },
                { status: 400 }
            )
        }

        const remainingAmount = paymentAmountPaise - (totalRefunded * 100)
        if (refundAmountPaise > remainingAmount) {
            return NextResponse.json({
                error: 'Refund amount exceeds remaining refundable amount',
                details: {
                    paymentAmount: payment.amount,
                    totalRefunded: totalRefunded,
                    remainingAmount: remainingAmount / 100,
                    requestedRefund: refundAmountRupees
                }
            }, { status: 400 })
        }

        // 5. Create refund record in 'processing' state (acts as a lock)
        const refundRecord = {
            payment_id: paymentId,
            user_id: payment.user_id,
            amount: refundAmountRupees,
            currency: payment.currency || 'INR',
            status: 'processing',
            reason: reason || 'Admin initiated refund',
            idempotency_key: idempotencyKey,
            processed_by: authUser.id,
            razorpay_payment_id: payment.transaction_id,
            metadata: {
                original_payment_amount: payment.amount,
                total_previously_refunded: totalRefunded,
                remaining_amount_before_refund: remainingAmount / 100,
                request_id: requestId,
                client_ip: clientIp
            }
        }

        const { data: refund, error: refundCreateError } = await supabaseAdmin
            .from('refunds')
            .insert(refundRecord)
            .select()
            .single()

        if (refundCreateError) {
            // Check for unique constraint violation (race condition - another request created it)
            if (refundCreateError.message?.includes('unique') ||
                refundCreateError.message?.includes('duplicate')) {
                const { data: raceRefund } = await supabaseAdmin
                    .from('refunds')
                    .select('*')
                    .eq('idempotency_key', idempotencyKey)
                    .single()

                if (raceRefund?.status === 'completed') {
                    return NextResponse.json({
                        success: true,
                        message: 'Refund already processed (race condition)',
                        refund: raceRefund,
                        idempotencyKey,
                        cached: true
                    })
                }
            }

            console.error('[REFUND] Error creating refund record:', refundCreateError)
            return NextResponse.json(
                { error: 'Failed to create refund record' },
                { status: 500 }
            )
        }

        // 6. Process refund with Razorpay
        const razorpay = getRazorpay()
        if (!razorpay) {
            // Update refund record to failed
            await supabaseAdmin
                .from('refunds')
                .update({
                    status: 'failed',
                    error_message: 'Razorpay not configured',
                    failed_at: new Date().toISOString()
                })
                .eq('id', refund.id)

            return NextResponse.json(
                { error: 'Payment gateway not configured' },
                { status: 500 }
            )
        }

        let razorpayRefund: any = null
        try {
            razorpayRefund = await razorpay.payments.refund(payment.transaction_id, {
                amount: refundAmountPaise, // Amount in paise
                notes: {
                    refund_id: refund.id,
                    admin_id: authUser.id,
                    reason: reason || 'Admin initiated refund',
                    idempotency_key: idempotencyKey
                }
            })
        } catch (razorpayError: any) {
            console.error('[REFUND] Razorpay refund failed:', razorpayError)

            // Update refund record to failed
            await supabaseAdmin
                .from('refunds')
                .update({
                    status: 'failed',
                    error_message: razorpayError.error?.description || razorpayError.message || 'Razorpay refund failed',
                    razorpay_error_code: razorpayError.error?.code,
                    failed_at: new Date().toISOString()
                })
                .eq('id', refund.id)

            return NextResponse.json({
                error: 'Refund processing failed',
                details: razorpayError.error?.description || razorpayError.message
            }, { status: 502 })
        }

        // 7. Update refund record with success details
        const { data: completedRefund, error: updateError } = await supabaseAdmin
            .from('refunds')
            .update({
                status: 'completed',
                razorpay_refund_id: razorpayRefund.id,
                razorpay_status: razorpayRefund.status,
                processed_at: new Date().toISOString(),
                receipt_url: razorpayRefund.receipt_url,
                speed_processed: razorpayRefund.speed_processed,
                speed_requested: razorpayRefund.speed_requested
            })
            .eq('id', refund.id)
            .select()
            .single()

        if (updateError) {
            console.error('[REFUND] Error updating refund record:', updateError)
            // Don't fail - Razorpay refund succeeded, just log the error
        }

        // 8. Update payment_logs status if fully refunded
        const newTotalRefunded = totalRefunded + refundAmountRupees
        if (newTotalRefunded >= payment.amount) {
            await supabaseAdmin
                .from('payment_logs')
                .update({
                    status: 'refunded',
                    refunded_at: new Date().toISOString(),
                    refund_amount: newTotalRefunded
                })
                .eq('id', paymentId)
        } else {
            // Partial refund - update refund amount but keep status as success
            await supabaseAdmin
                .from('payment_logs')
                .update({
                    refund_amount: newTotalRefunded,
                    partially_refunded_at: new Date().toISOString()
                })
                .eq('id', paymentId)
        }

        // 9. Handle subscription cancellation if this was a subscription payment
        if (payment.subscription_id && newTotalRefunded >= payment.amount) {
            await supabaseAdmin
                .from('subscriptions')
                .update({
                    status: 'cancelled',
                    cancellation_reason: 'Full refund issued',
                    cancelled_at: new Date().toISOString()
                })
                .eq('id', payment.subscription_id)
                .eq('status', 'active') // Only cancel active subscriptions
        }

        const processingTime = Date.now() - startTime

        console.log(`[REFUND] Refund processed successfully: ${refund.id} in ${processingTime}ms`)

        return NextResponse.json({
            success: true,
            message: 'Refund processed successfully',
            refund: completedRefund || refund,
            idempotencyKey,
            razorpayRefund: {
                id: razorpayRefund.id,
                status: razorpayRefund.status,
                amount: razorpayRefund.amount / 100 // Convert paise to rupees
            },
            payment: {
                id: paymentId,
                totalRefunded: newTotalRefunded,
                fullyRefunded: newTotalRefunded >= payment.amount
            },
            processingTimeMs: processingTime
        })

    } catch (error: any) {
        console.error('[REFUND] Unexpected error:', error)
        return NextResponse.json(
            { error: error?.message || 'Refund processing failed' },
            { status: 500 }
        )
    }
}

/**
 * GET /api/admin/refunds
 * List refunds with optional filtering
 */
export async function GET(request: NextRequest) {
    try {
        // CSRF Protection
        const csrfCheck = await csrfProtection(request)
        if (!csrfCheck.valid) {
            return NextResponse.json(
                { error: csrfCheck.error || 'Invalid request' },
                { status: 403 }
            )
        }

        // Rate limiting: 100 requests per hour per admin
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                         request.headers.get('x-real-ip') ||
                         'unknown'
        const rateLimitKey = `admin:refunds:list:${clientIp}`
        const rateLimitResult = await rateLimit(rateLimitKey, 100, 60 * 60 * 1000)
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again later.' },
                { status: 429 }
            )
        }

        // Verify Authentication & Admin Role
        const supabase = await createClient()
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: userProfile, error: profileError } = await supabase
            .from('users')
            .select('role')
            .eq('id', authUser.id)
            .maybeSingle()

        if (profileError || !userProfile || userProfile.role !== 'admin') {
            return NextResponse.json(
                { error: 'Forbidden: Admin access required' },
                { status: 403 }
            )
        }

        // Parse query parameters
        const { searchParams } = new URL(request.url)
        const status = searchParams.get('status')
        const paymentId = searchParams.get('paymentId')
        const userId = searchParams.get('userId')
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
        const offset = parseInt(searchParams.get('offset') || '0')

        // Build query
        let query = supabaseAdmin
            .from('refunds')
            .select('*, payment_logs!inner(transaction_id, amount)', { count: 'exact' })

        if (status) {
            query = query.eq('status', status)
        }

        if (paymentId) {
            query = query.eq('payment_id', paymentId)
        }

        if (userId) {
            query = query.eq('user_id', userId)
        }

        // Execute query with pagination
        const { data: refunds, error, count } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (error) {
            console.error('[REFUND] Error fetching refunds:', error)
            return NextResponse.json(
                { error: 'Failed to fetch refunds' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            refunds,
            pagination: {
                total: count || 0,
                limit,
                offset,
                hasMore: (count || 0) > offset + limit
            }
        })

    } catch (error: any) {
        console.error('[REFUND] Unexpected error:', error)
        return NextResponse.json(
            { error: error?.message || 'Failed to fetch refunds' },
            { status: 500 }
        )
    }
}
