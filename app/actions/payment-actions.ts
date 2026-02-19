'use server'

import { createRazorpayOrder, verifyRazorpaySignature } from "@/lib/payment-service"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { PLAN_LIMITS } from "@/lib/constants"
import { validatePlanAmount } from "@/lib/pricing"

// In-memory store for recent idempotency keys (resets on server restart)
// For production, use Redis or database
const recentIdempotencyKeys = new Map<string, { timestamp: number; orderId: string }>()
const IDEMPOTENCY_KEY_TTL = 24 * 60 * 60 * 1000 // 24 hours

// Cleanup old idempotency keys periodically
setInterval(() => {
    const now = Date.now()
    for (const [key, value] of recentIdempotencyKeys.entries()) {
        if (now - value.timestamp > IDEMPOTENCY_KEY_TTL) {
            recentIdempotencyKeys.delete(key)
        }
    }
}, 60 * 60 * 1000) // Run every hour

/**
 * Check for existing payment or subscription before creating new order
 * Prevents duplicate payments from the same user
 */
export async function checkExistingPaymentAction(userId: string, planName: string) {
    try {
        // Check for recent pending payments (last 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        const { data: recentPayments, error: paymentError } = await supabaseAdmin
            .from('payment_logs')
            .select('id, status, created_at')
            .eq('user_id', userId)
            .gte('created_at', fiveMinutesAgo)
            .order('created_at', { ascending: false })
            .limit(1)

        if (paymentError) {
            console.error('Error checking recent payments:', paymentError)
        }

        const hasRecentPayment = recentPayments && recentPayments.length > 0 &&
            recentPayments[0].status === 'pending'

        // Check for active subscription for this plan
        const { data: activeSubscription, error: subError } = await supabaseAdmin
            .from('subscriptions')
            .select('id, plan_name, status')
            .eq('user_id', userId)
            .eq('status', 'active')
            .maybeSingle()

        if (subError) {
            console.error('Error checking active subscription:', subError)
        }

        const hasActiveSubscription = activeSubscription?.plan_name === planName

        return {
            success: true,
            hasRecentPayment,
            hasActiveSubscription,
            activeSubscription
        }
    } catch (error: any) {
        console.error('Error in checkExistingPaymentAction:', error)
        return { success: false, error: error.message }
    }
}

// Store full order details for idempotency
const orderDetailsCache = new Map<string, { id: string; amount: number; currency: string }>()

export async function initiatePlanPurchaseAction(
    userId: string,
    planName: string,
    amount: number,
    duration: string,
    idempotencyKey?: string
) {
    try {
        // Validate amount against server-side pricing
        const validation = validatePlanAmount(planName, duration, amount)
        if (!validation.valid) {
            console.error('[initiatePlanPurchaseAction] Amount validation failed:', validation.error)
            return {
                success: false,
                error: validation.error,
                details: {
                    expected: validation.expected,
                    received: validation.received
                }
            }
        }

        // Check idempotency key if provided
        if (idempotencyKey) {
            const existing = recentIdempotencyKeys.get(idempotencyKey)
            if (existing) {
                // Return the existing order with full details
                const cachedOrder = orderDetailsCache.get(existing.orderId)
                if (cachedOrder) {
                    return {
                        success: true,
                        order: cachedOrder,
                        idempotent: true
                    }
                }
            }
        }

        const { order, error } = await createRazorpayOrder(amount, 'INR', {
            userId,
            planName,
            duration
        })

        if (error) throw error

        // Store idempotency key and order details
        if (idempotencyKey && order?.id) {
            recentIdempotencyKeys.set(idempotencyKey, {
                timestamp: Date.now(),
                orderId: order.id
            })
            // Cache order details for idempotent responses
            orderDetailsCache.set(order.id, {
                id: order.id,
                amount: Number(order.amount),
                currency: order.currency
            })
        }

        return { success: true, order }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// In-memory store for processed idempotency keys in fulfillment
const processedFulfillmentKeys = new Map<string, { timestamp: number; result: any }>()
const FULFILLMENT_KEY_TTL = 24 * 60 * 60 * 1000 // 24 hours

// Cleanup old fulfillment keys periodically
setInterval(() => {
    const now = Date.now()
    for (const [key, value] of processedFulfillmentKeys.entries()) {
        if (now - value.timestamp > FULFILLMENT_KEY_TTL) {
            processedFulfillmentKeys.delete(key)
        }
    }
}, 60 * 60 * 1000) // Run every hour

export async function fulfillSubscriptionAction(data: {
    userId: string
    planName: string
    planDuration: string
    amount: number
    razorpayOrderId: string
    razorpayPaymentId: string
    razorpaySignature: string
    idempotencyKey?: string
}) {
    try {
        // Check idempotency key if provided
        if (data.idempotencyKey) {
            const existingResult = processedFulfillmentKeys.get(data.idempotencyKey)
            if (existingResult) {
                return { success: true, message: 'Payment already processed (idempotent)', idempotent: true }
            }
        }

        // 1. Verify Signature
        const isValid = verifyRazorpaySignature(
            data.razorpayOrderId,
            data.razorpayPaymentId,
            data.razorpaySignature
        )

        if (!isValid) {
            throw new Error("Invalid payment signature")
        }

        // 2. Validate amount against server-side pricing
        const validation = validatePlanAmount(data.planName, data.planDuration, data.amount)
        if (!validation.valid) {
            console.error('[fulfillSubscriptionAction] Amount validation failed:', validation.error)
            throw new Error(`Payment amount validation failed: ${validation.error}`)
        }

        // 3. Calculate End Date using UTC to avoid timezone issues
        const now = new Date()
        const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()))
        const endDate = new Date(startDate)
        if (data.planDuration.includes('month')) {
            const months = parseInt(data.planDuration)
            endDate.setUTCMonth(endDate.getUTCMonth() + months)
        } else if (data.planDuration.includes('year')) {
            endDate.setUTCFullYear(endDate.getUTCFullYear() + 1)
        } else {
            // Default fallback based on common plans
            if (data.planName === 'Silver') endDate.setUTCMonth(endDate.getUTCMonth() + 1)
            else if (data.planName === 'Gold') endDate.setUTCMonth(endDate.getUTCMonth() + 3)
            else if (data.planName === 'Platinum') endDate.setUTCMonth(endDate.getUTCMonth() + 6)
            else if (data.planName === 'Elite') endDate.setUTCFullYear(endDate.getUTCFullYear() + 1)
        }

        // 3. Use centralized PLAN_LIMITS from constants (single source of truth)
        const propertiesLimit = PLAN_LIMITS[data.planName.toUpperCase() as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.FREE

        // 4. 🔥 ATOMIC OPERATION: Use database function to prevent race conditions
        const { data: result, error: rpcError } = await supabaseAdmin.rpc(
            'atomic_subscription_replace',
            {
                p_user_id: data.userId,
                p_plan_name: data.planName,
                p_plan_duration: data.planDuration,
                p_amount: data.amount,
                p_properties_limit: propertiesLimit,
                p_start_date: startDate.toISOString(),
                p_end_date: endDate.toISOString(),
                p_transaction_id: data.razorpayPaymentId,
                p_triggered_by: 'manual_action'
            }
        )

        if (rpcError) {
            console.error('[fulfillSubscriptionAction] RPC error:', rpcError)
            throw new Error(`Failed to create subscription: ${rpcError.message}`)
        }

        if (!result?.success) {
            const errorMessage = result?.error || result?.message || 'Unknown error'
            console.error('[fulfillSubscriptionAction] Atomic function failed:', result)
            throw new Error(`Subscription creation failed: ${errorMessage}`)
        }

        // If idempotent (already processed), return early
        if (result.idempotent) {
            // Store result for idempotency
            if (data.idempotencyKey) {
                processedFulfillmentKeys.set(data.idempotencyKey, {
                    timestamp: Date.now(),
                    result: { success: true, message: 'Payment already processed' }
                })
            }
            return { success: true, message: 'Payment already processed' }
        }

        const subscriptionId = result.subscription_id

        // 5. Auto-feature existing properties if plan allows
        const { getTierFeatures } = await import('@/lib/subscription-service')
        const planFeatures = {
            'FREE': { featuredBadge: false },
            'SILVER': { featuredBadge: true },
            'GOLD': { featuredBadge: true },
            'PLATINUM': { featuredBadge: true },
            'ELITE': { featuredBadge: true }
        }
        const currentTierFeatures = planFeatures[data.planName.toUpperCase() as keyof typeof planFeatures]

        if (currentTierFeatures?.featuredBadge) {
            await supabaseAdmin
                .from('properties')
                .update({ featured: true })
                .eq('owner_id', data.userId)
                .in('status', ['active', 'pending'])
        }

        // 6. Send Success Email
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('email, name')
            .eq('id', data.userId)
            .maybeSingle()

        if (user) {
            const { sendPaymentSuccessEmail } = await import('@/lib/email-service')
            await sendPaymentSuccessEmail({
                email: user.email,
                name: user.name,
                planName: data.planName,
                amount: data.amount,
                transactionId: data.razorpayPaymentId,
                endDate: endDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })
            })
        }

        // Store successful result for idempotency
        if (data.idempotencyKey) {
            processedFulfillmentKeys.set(data.idempotencyKey, {
                timestamp: Date.now(),
                result: { success: true }
            })
        }

        return { success: true }
    } catch (error: any) {
        console.error("Fulfillment Error:", error)
        return { success: false, error: error.message }
    }
}
