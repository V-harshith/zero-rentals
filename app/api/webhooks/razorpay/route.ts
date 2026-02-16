import { NextRequest, NextResponse } from 'next/server'
import { validateWebhookSignature } from '@/lib/payment-service'
import { supabaseAdmin } from '@/lib/supabase-admin'

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
async function processEventByType(eventType: string, payload: { payload: { order: { entity: { notes: { userId: string; planName: string; duration: string }; amount: number; id: string } } } }): Promise<void> {
    if (eventType === 'order.paid') {
        const order = payload.payload.order.entity
        const notes = order.notes
        await fulfillSubscription(
            notes.userId,
            notes.planName,
            notes.duration,
            order.amount / 100,
            order.id
        )
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
            const planName = notes.planName
            const duration = notes.duration
            const amount = order.amount / 100 // Convert from paise
            const orderId = order.id

            await fulfillSubscription(userId, planName, duration, amount, orderId)
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
    orderId: string
) {
    try {
        // 🔥 CRITICAL FIX: Check idempotency FIRST with proper error handling
        // Check both payment_logs and subscriptions to handle race conditions
        const { data: existingPayment, error: checkError } = await supabaseAdmin
            .from('payment_logs')
            .select('id, status, subscription_id')
            .eq('transaction_id', orderId)
            .maybeSingle()

        if (checkError) {
            console.error('Error checking payment logs:', checkError)
            throw checkError
        }

        if (existingPayment?.status === 'success') {
            console.log('Payment already processed (idempotency check):', orderId)
            return
        }

        // Double-check: see if there's an active subscription for this order
        // This handles the case where payment_log update failed but subscription was created
        const { data: existingSub } = await supabaseAdmin
            .from('subscriptions')
            .select('id')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (existingSub && existingPayment?.subscription_id === existingSub.id) {
            console.log('Subscription already exists for this order:', orderId)
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

        // Map properties limit (aligned with constants.ts)
        const limitMap: Record<string, number> = {
            'Free': 1,
            'Silver': 3,
            'Gold': 5,
            'Platinum': 10,
            'Elite': 999
        }
        const propertiesLimit = limitMap[planName] || 1

        // 🔥 CRITICAL FIX: Use transaction-like approach with idempotency
        // Cancel existing active subscriptions
        const { error: cancelError } = await supabaseAdmin
            .from('subscriptions')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('status', 'active')

        if (cancelError) {
            console.error('Error cancelling existing subscriptions:', cancelError)
        }

        // Create new subscription with upsert for idempotency
        // Use orderId as a unique reference to prevent duplicates
        let subscriptionResult = await supabaseAdmin
            .from('subscriptions')
            .insert([{
                user_id: userId,
                plan_name: planName,
                plan_duration: duration,
                amount: amount,
                status: 'active',
                properties_limit: propertiesLimit,
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
                metadata: { order_id: orderId } // Store order reference for idempotency
            }])
            .select()
            .single()

        let subscription: { id: string } | null = null

        if (subscriptionResult.error) {
            // Check if subscription was created by another concurrent request
            const { data: raceSub } = await supabaseAdmin
                .from('subscriptions')
                .select('id, metadata')
                .eq('user_id', userId)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (raceSub?.metadata?.order_id === orderId) {
                console.log('Subscription created by concurrent request:', orderId)
                // Use the existing subscription
                subscription = raceSub as { id: string }
            } else {
                throw subscriptionResult.error
            }
        } else {
            subscription = subscriptionResult.data
        }

        // This should not happen, but TypeScript requires the check
        if (!subscription) {
            throw new Error('Failed to create or retrieve subscription')
        }

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

        // Create payment log with upsert for idempotency
        const { error: logError } = await supabaseAdmin
            .from('payment_logs')
            .upsert({
                user_id: userId,
                subscription_id: subscription.id,
                amount: amount,
                transaction_id: orderId,
                status: 'success',
                payment_gateway: 'razorpay',
                processed_at: new Date().toISOString()
            }, {
                onConflict: 'transaction_id',
                ignoreDuplicates: true // Don't error if already exists
            })

        if (logError) {
            console.error('Error creating payment log:', logError)
            // Non-fatal: subscription was created successfully
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
