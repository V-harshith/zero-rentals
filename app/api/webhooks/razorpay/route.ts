import { NextRequest, NextResponse } from 'next/server'
import { validateWebhookSignature } from '@/lib/payment-service'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { handleCancelledToRenewed } from '@/lib/subscription-service-server'
import {
    determineSubscriptionAction,
    type SubscriptionStatus
} from '@/lib/subscription-service'
import { validatePlanAmount, validatePropertyAmount } from '@/lib/pricing'
import { PLAN_LIMITS } from '@/lib/constants'

// Event sequence numbers for ordering (higher = more recent)
const EVENT_SEQUENCE: Record<string, number> = {
    'subscription.created': 1,
    'subscription.updated': 2,
    'subscription.charged': 3,
    'subscription.cancelled': 4,
    'order.paid': 5,
    'payment.captured': 6,
    'payment.failed': 6,
    'invoice.paid': 7,
    'invoice.failed': 7
}

interface WebhookEventRecord {
    id: string
    event_id: string
    event_type: string
    status: 'pending' | 'processing' | 'completed' | 'failed'
    sequence_number: number
    entity_id: string | null
    created_at: string
    processed_at: string | null
}

/**
 * Extract entity ID from webhook payload for sequencing
 * This identifies which subscription/order the event belongs to
 */
function getEntityId(event: { event: string; payload: Record<string, { entity: { id: string; subscription_id?: string } }> }): string | null {
    const payload = event.payload

    // Try to extract entity ID based on event type
    if (payload.subscription?.entity) {
        return payload.subscription.entity.id
    }
    if (payload.order?.entity) {
        return payload.order.entity.id
    }
    if (payload.payment?.entity) {
        return payload.payment.entity.subscription_id || payload.payment.entity.id
    }
    if (payload.invoice?.entity) {
        return payload.invoice.entity.subscription_id || payload.invoice.entity.id
    }

    return null
}

/**
 * Check if event should be processed now or queued for later
 * Returns true if this event can be processed, false if it should be queued
 */
async function shouldProcessEvent(
    eventType: string,
    entityId: string | null,
    sequenceNumber: number
): Promise<{ shouldProcess: boolean; pendingEvents: WebhookEventRecord[] }> {
    if (!entityId) {
        // No entity ID, process immediately (can't sequence)
        return { shouldProcess: true, pendingEvents: [] }
    }

    // Check for any pending events for this entity with lower sequence numbers
    const { data: pendingEvents, error } = await supabaseAdmin
        .from('webhook_events')
        .select('id, event_id, event_type, status, sequence_number, entity_id, created_at, processed_at')
        .eq('entity_id', entityId)
        .lt('sequence_number', sequenceNumber)
        .in('status', ['pending', 'processing', 'failed'])
        .order('sequence_number', { ascending: true })

    if (error) {
        console.error('Error checking pending events:', error)
        // On error, allow processing to avoid getting stuck
        return { shouldProcess: true, pendingEvents: [] }
    }

    // If there are pending events with lower sequence numbers, queue this one
    if (pendingEvents && pendingEvents.length > 0) {
        return { shouldProcess: false, pendingEvents }
    }

    return { shouldProcess: true, pendingEvents: [] }
}

/**
 * Process any queued events that can now be processed
 * Called after completing an event
 */
async function processQueuedEvents(entityId: string | null): Promise<void> {
    if (!entityId) return

    // Find queued events for this entity ordered by sequence
    const { data: queuedEvents, error } = await supabaseAdmin
        .from('webhook_events')
        .select('id, event_id, event_type, payload, sequence_number')
        .eq('entity_id', entityId)
        .eq('status', 'pending')
        .order('sequence_number', { ascending: true })

    if (error || !queuedEvents || queuedEvents.length === 0) {
        return
    }

    // Process each queued event in order
    for (const queuedEvent of queuedEvents) {
        // Check if prerequisites are now met
        const { shouldProcess } = await shouldProcessEvent(
            queuedEvent.event_type,
            entityId,
            queuedEvent.sequence_number
        )

        if (shouldProcess) {
            console.log('Processing queued event:', queuedEvent.event_id)

            // Update status to processing
            await supabaseAdmin
                .from('webhook_events')
                .update({ status: 'processing' })
                .eq('event_id', queuedEvent.event_id)

            try {
                // Process the event based on type
                await processEventByType(queuedEvent.event_type, queuedEvent.payload)

                // Mark as completed
                await supabaseAdmin
                    .from('webhook_events')
                    .update({
                        status: 'completed',
                        processed_at: new Date().toISOString()
                    })
                    .eq('event_id', queuedEvent.event_id)
            } catch (error) {
                // Mark as failed
                await supabaseAdmin
                    .from('webhook_events')
                    .update({
                        status: 'failed',
                        error: (error as Error).message,
                        processed_at: new Date().toISOString()
                    })
                    .eq('event_id', queuedEvent.event_id)

                // Stop processing queue on error to maintain order
                break
            }
        } else {
            // Still can't process this one, stop here
            break
        }
    }
}

/**
 * Process event based on its type
 */
async function processEventByType(eventType: string, payload: { payload: { order: { entity: { notes: { userId: string; type?: string; planName?: string; duration?: string; plan?: string; days?: string }; amount: number; id: string } } } }): Promise<void> {
    if (eventType === 'order.paid') {
        const order = payload.payload.order.entity
        const notes = order.notes
        const paymentType = notes.type || 'subscription'

        if (paymentType === 'property_payment') {
            // Validate required property payment fields
            if (!notes.plan || !notes.days) {
                console.error('Missing required property payment fields in queued event:', {
                    userId: notes.userId,
                    plan: notes.plan,
                    days: notes.days
                })
                throw new Error('Invalid property payment metadata: missing plan or days')
            }

            const days = parseInt(notes.days, 10)
            if (isNaN(days) || days <= 0) {
                throw new Error(`Invalid days value: ${notes.days}`)
            }

            await fulfillPropertyPayment(
                notes.userId,
                notes.plan,
                days,
                order.amount / 100,
                order.payment_id || order.id // Use payment_id for transaction_id
            )
        } else {
            // Validate required subscription fields
            if (!notes.planName || !notes.duration) {
                console.error('Missing required subscription fields in queued event:', {
                    userId: notes.userId,
                    planName: notes.planName,
                    duration: notes.duration
                })
                throw new Error('Invalid subscription metadata: missing planName or duration')
            }

            await fulfillSubscription(
                notes.userId,
                notes.planName,
                notes.duration,
                order.amount / 100,
                order.id
            )
        }
    }
    // Add other event types as needed
}

export async function POST(req: NextRequest) {
    const body = await req.text()
    const signature = req.headers.get('x-razorpay-signature')

    // 🔥 CRITICAL: Idempotency key from Razorpay for duplicate detection
    const idempotencyKey = req.headers.get('x-razorpay-event-id')

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
    const eventType = event.event as string
    const entityId = getEntityId(event)
    const sequenceNumber = EVENT_SEQUENCE[eventType] || 999

    // 🔥 CRITICAL: Idempotency check using Razorpay's event ID
    // Store processed event IDs to prevent duplicate processing
    if (idempotencyKey) {
        const { data: existingEvent, error: checkError } = await supabaseAdmin
            .from('webhook_events')
            .select('id, processed_at, status')
            .eq('event_id', idempotencyKey)
            .maybeSingle()

        if (checkError) {
            console.error('Error checking webhook event idempotency:', checkError)
        }

        if (existingEvent) {
            console.log('Webhook event already processed (idempotency):', idempotencyKey)
            return NextResponse.json({
                received: true,
                idempotent: true,
                processed_at: existingEvent.processed_at,
                status: existingEvent.status
            })
        }

        // Check event sequencing - should we process now or queue?
        const { shouldProcess, pendingEvents } = await shouldProcessEvent(
            eventType,
            entityId,
            sequenceNumber
        )

        if (!shouldProcess) {
            console.log('Queuing out-of-order event:', idempotencyKey, 'type:', eventType,
                'pending:', pendingEvents.map(e => e.event_type).join(', '))

            // Store as pending (queued for later)
            const { error: insertError } = await supabaseAdmin
                .from('webhook_events')
                .insert({
                    event_id: idempotencyKey,
                    event_type: eventType,
                    payload: event,
                    status: 'pending',
                    sequence_number: sequenceNumber,
                    entity_id: entityId,
                    created_at: new Date().toISOString()
                })

            if (insertError) {
                console.error('Failed to queue webhook event:', insertError)
            }

            return NextResponse.json({
                received: true,
                queued: true,
                reason: 'out_of_order',
                pending_events: pendingEvents.length
            })
        }

        // Store event ID before processing (mark as processing)
        const { error: insertError } = await supabaseAdmin
            .from('webhook_events')
            .insert({
                event_id: idempotencyKey,
                event_type: eventType,
                payload: event,
                status: 'processing',
                sequence_number: sequenceNumber,
                entity_id: entityId,
                created_at: new Date().toISOString()
            })

        if (insertError) {
            // Check if another process inserted this event concurrently
            const { data: concurrentEvent } = await supabaseAdmin
                .from('webhook_events')
                .select('id, status')
                .eq('event_id', idempotencyKey)
                .maybeSingle()

            if (concurrentEvent) {
                console.log('Webhook event being processed by another handler:', idempotencyKey)
                return NextResponse.json({
                    received: true,
                    idempotent: true,
                    status: 'processing'
                })
            }

            console.error('Failed to record webhook event:', insertError)
        }
    }

    try {
        // Handle order.paid event
        if (eventType === 'order.paid') {
            const order = event.payload.order.entity
            const notes = order.notes
            const userId = notes.userId
            const amount = order.amount / 100 // Convert from paise
            const orderId = order.id
            // 🔥 FIX: Use payment_id for transaction_id to match client-side handler
            // This ensures idempotency works across both webhook and client paths
            const paymentId = order.payment_id || orderId
            const paymentType = notes.type || 'subscription' // Default to subscription for backward compat

            console.log('[webhook] order.paid received:', {
                orderId,
                paymentId,
                userId,
                amount,
                paymentType
            })

            if (paymentType === 'property_payment') {
                // Handle property addon payment
                const plan = notes.plan
                const daysValue = notes.days

                // Validate required fields
                if (!plan || !daysValue) {
                    console.error('[webhook] Missing required property payment metadata:', {
                        userId,
                        plan,
                        days: daysValue
                    })
                    await supabaseAdmin
                        .from('payment_logs')
                        .insert({
                            user_id: userId,
                            amount: amount,
                            currency: 'INR',
                            payment_gateway: 'razorpay',
                            transaction_id: orderId,
                            status: 'failed',
                            metadata: { type: 'property_payment', error: 'Missing plan or days' }
                        })
                    return NextResponse.json(
                        { error: 'Invalid payment metadata: missing plan or days' },
                        { status: 400 }
                    )
                }

                const days = parseInt(daysValue, 10)
                if (isNaN(days) || days <= 0) {
                    console.error('[webhook] Invalid days value:', daysValue)
                    await supabaseAdmin
                        .from('payment_logs')
                        .insert({
                            user_id: userId,
                            amount: amount,
                            currency: 'INR',
                            payment_gateway: 'razorpay',
                            transaction_id: orderId,
                            status: 'failed',
                            metadata: { type: 'property_payment', plan, days: daysValue, error: 'Invalid days value' }
                        })
                    return NextResponse.json(
                        { error: 'Invalid payment metadata: days must be a positive number' },
                        { status: 400 }
                    )
                }

                // Validate amount against server-side pricing
                const validation = validatePropertyAmount(plan, amount)
                if (!validation.valid) {
                    console.error('[webhook] Property amount validation failed:', validation.error)
                    // Log security event
                    await supabaseAdmin
                        .from('payment_logs')
                        .insert({
                            user_id: userId,
                            amount: amount,
                            currency: 'INR',
                            payment_gateway: 'razorpay',
                            transaction_id: orderId,
                            status: 'failed',
                            metadata: { type: 'property_payment', plan, days, error: validation.error }
                        })
                    // Return error to prevent fulfillment
                    return NextResponse.json(
                        { error: 'Amount validation failed', details: validation.error },
                        { status: 400 }
                    )
                }

                await fulfillPropertyPayment(userId, plan, days, amount, paymentId)
            } else {
                // Handle subscription payment (default, backward compatible)
                const planName = notes.planName
                const duration = notes.duration
                // 🔥 FIX: Get payment_id from order for transaction_id
                // This ensures idempotency works across both webhook and client paths
                const paymentId = order.payment_id || orderId

                // Validate amount against server-side pricing
                const validation = validatePlanAmount(planName, duration, amount)
                if (!validation.valid) {
                    console.error('[webhook] Amount validation failed:', validation.error)
                    // Log security event
                    await supabaseAdmin
                        .from('payment_logs')
                        .insert({
                            user_id: userId,
                            amount: amount,
                            currency: 'INR',
                            payment_gateway: 'razorpay',
                            transaction_id: paymentId,
                            status: 'failed',
                            plan_name: planName,
                        })
                    // Return error to prevent subscription fulfillment
                    return NextResponse.json(
                        { error: 'Amount validation failed', details: validation.error },
                        { status: 400 }
                    )
                }

                console.log('[webhook] Processing subscription:', {
                    userId,
                    planName,
                    duration,
                    amount,
                    paymentId
                })

                await fulfillSubscription(userId, planName, duration, amount, paymentId)
            }
        }

        // Mark event as completed
        if (idempotencyKey) {
            await supabaseAdmin
                .from('webhook_events')
                .update({
                    status: 'completed',
                    processed_at: new Date().toISOString()
                })
                .eq('event_id', idempotencyKey)
        }

        // Process any queued events that can now proceed
        await processQueuedEvents(entityId)

        return NextResponse.json({ received: true, processed: true })
    } catch (error) {
        // Mark event as failed for retry
        if (idempotencyKey) {
            await supabaseAdmin
                .from('webhook_events')
                .update({
                    status: 'failed',
                    error: (error as Error).message,
                    processed_at: new Date().toISOString()
                })
                .eq('event_id', idempotencyKey)
        }

        // Re-throw to let Razorpay retry
        throw error
    }
}

async function fulfillSubscription(
    userId: string,
    planName: string,
    duration: string,
    amount: number,
    transactionId: string // Changed from orderId to transactionId for idempotency
) {
    try {
        // Calculate dates
        const now = new Date()
        const startDate = new Date(Date.UTC(
            now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
            now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()
        ))
        const endDate = new Date(startDate)

        if (duration.includes('month')) {
            const months = parseInt(duration)
            endDate.setUTCMonth(endDate.getUTCMonth() + months)
        } else if (duration.includes('year')) {
            endDate.setUTCFullYear(endDate.getUTCFullYear() + 1)
        }

        const propertiesLimit = PLAN_LIMITS[planName.toUpperCase() as keyof typeof PLAN_LIMITS] || 1

        // 🔥 ATOMIC OPERATION: Use database function to prevent race conditions
        const { data: result, error: rpcError } = await supabaseAdmin.rpc(
            'atomic_subscription_replace',
            {
                p_user_id: userId,
                p_plan_name: planName,
                p_plan_duration: duration,
                p_amount: amount,
                p_properties_limit: propertiesLimit,
                p_start_date: startDate.toISOString(),
                p_end_date: endDate.toISOString(),
                p_transaction_id: transactionId,
                p_triggered_by: 'webhook'
            }
        )

        if (rpcError) {
            console.error('Atomic subscription replacement failed:', rpcError)
            throw rpcError
        }

        if (!result) {
            throw new Error('No result from atomic subscription replacement')
        }

        // Handle idempotent response
        if (result.idempotent) {
            console.log('Payment already processed (idempotent):', orderId)
            return
        }

        if (!result.success) {
            if (result.code === 'CONCURRENT_CREATION') {
                console.log('Concurrent subscription creation detected:', orderId)
                return
            }
            throw new Error(result.error || 'Failed to process subscription')
        }

        // 🔥 NEW: Auto-feature existing properties if plan allows
        const planFeatures = {
            'FREE': { featuredBadge: false },
            'SILVER': { featuredBadge: true },
            'GOLD': { featuredBadge: true },
            'PLATINUM': { featuredBadge: true },
            'ELITE': { featuredBadge: true }
        }
        const currentTierFeatures = planFeatures[planName.toUpperCase() as keyof typeof planFeatures]

        if (currentTierFeatures?.featuredBadge) {
            console.log('[Auto-feature] Updating properties for user:', userId, 'plan:', planName)
            const { data: updatedProperties, error: featureError, count } = await supabaseAdmin
                .from('properties')
                .update({ featured: true })
                .eq('owner_id', userId)
                .in('status', ['active', 'pending'])
                .select('id')

            if (featureError) {
                console.error('[Auto-feature] FAILED for user:', userId, 'error:', featureError)
            } else {
                console.log('[Auto-feature] SUCCESS for user:', userId, 'properties updated:', updatedProperties?.length || count || 0)
            }
        } else {
            console.log('[Auto-feature] Skipped - plan does not include featured badge:', planName)
        }

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

async function fulfillPropertyPayment(
    userId: string,
    plan: string,
    days: number,
    amount: number,
    transactionId: string // Changed from orderId to transactionId for idempotency
) {
    try {
        // Step 1: Verify user has active subscription (required for property payments)
        const { data: subscription, error: subError } = await supabaseAdmin
            .from('subscriptions')
            .select('id, status, end_date')
            .eq('user_id', userId)
            .eq('status', 'active')
            .gt('end_date', new Date().toISOString())
            .maybeSingle()

        if (subError) {
            console.error('Error checking subscription:', subError)
            throw new Error('Failed to verify subscription status')
        }

        if (!subscription) {
            console.error('Property payment attempted without active subscription:', userId)
            throw new Error('Active subscription required for property payments')
        }

        // Step 2: Check if payment log already exists (idempotency)
        const { data: existingLog } = await supabaseAdmin
            .from('payment_logs')
            .select('id, status')
            .eq('transaction_id', orderId)
            .maybeSingle()

        if (existingLog) {
            if (existingLog.status === 'completed' || existingLog.status === 'success') {
                console.log('Property payment already processed:', orderId)
                return
            }
            // Update existing pending/processing log
            const { error: updateError } = await supabaseAdmin
                .from('payment_logs')
                .update({
                    status: 'completed',
                    payment_method: 'razorpay',
                    processed_at: new Date().toISOString()
                })
                .eq('transaction_id', orderId)

            if (updateError) {
                console.error('Error updating payment log:', updateError)
                throw updateError
            }
        } else {
            // Create new payment log entry
            const { error: insertError } = await supabaseAdmin
                .from('payment_logs')
                .insert({
                    user_id: userId,
                    amount: amount,
                    currency: 'INR',
                    payment_gateway: 'razorpay',
                    transaction_id: orderId,
                    status: 'completed',
                    payment_method: 'razorpay',
                    metadata: {
                        type: 'property_payment',
                        plan: plan,
                        days: days,
                        property_expires_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
                    },
                    processed_at: new Date().toISOString()
                })

            if (insertError) {
                if (insertError.code === '23505') { // Unique violation
                    console.log('Property payment already processed by another webhook:', orderId)
                    return
                }
                console.error('Error creating payment log:', insertError)
                throw insertError
            }
        }

        console.log('Property payment fulfilled successfully:', {
            userId,
            orderId,
            plan,
            days,
            amount
        })

    } catch (error) {
        console.error('Property Payment Fulfillment Error:', error)
        // Re-throw to let Razorpay retry
        throw error
    }
}
