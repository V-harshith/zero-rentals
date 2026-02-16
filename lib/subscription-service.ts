import { supabase } from '@/lib/supabase'
import { PLAN_LIMITS, PLAN_NAMES, PLAN_FEATURES } from '@/lib/constants'

export type LimitCheckResult = {
    allowed: boolean
    limit: number
    current: number
    planName: string
    reason?: string
}

export type TierFeatures = {
    maxPhotos: number
    analytics: boolean
    featuredBadge: boolean
    prioritySupport: boolean
    whatsappAccess: boolean
    planName: string
    isElite: boolean
}

// ============================================
// SUBSCRIPTION STATE MACHINE
// ============================================

export type SubscriptionStatus = 'active' | 'expired' | 'cancelled'

export type SubscriptionTransition =
    | 'create'           // Initial creation
    | 'renew'            // Renew existing subscription
    | 'expire'           // Natural expiration (cron job)
    | 'cancel'           // User cancellation
    | 'reactivate'       // Reactivate cancelled subscription (rare)

/**
 * Valid state transitions for the subscription state machine.
 * Key: current status -> allowed next statuses
 */
export const VALID_STATE_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
    // Active can transition to: expired (end date reached), cancelled (user cancels)
    active: ['expired', 'cancelled'],
    // Expired is a terminal state - user must create a new subscription
    expired: [],
    // Cancelled can transition to: expired (if end date passes), active (if renewed before expiry)
    cancelled: ['expired', 'active']
}

/**
 * Transition reasons for audit logging
 */
export interface TransitionContext {
    reason: string
    triggeredBy: 'user' | 'system' | 'cron' | 'webhook' | 'admin'
    metadata?: Record<string, unknown>
}

/**
 * Validates if a state transition is allowed.
 * @param from Current subscription status
 * @param to Target subscription status
 * @returns boolean indicating if transition is valid
 */
export function isValidTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
    if (from === to) return true // Same state is always valid (idempotent)
    const allowedTransitions = VALID_STATE_TRANSITIONS[from]
    return allowedTransitions.includes(to)
}

/**
 * Gets the transition type based on from/to states.
 * @param from Current subscription status
 * @param to Target subscription status
 * @returns The transition type
 */
export function getTransitionType(from: SubscriptionStatus, to: SubscriptionStatus): SubscriptionTransition | null {
    if (from === to) return null // No transition

    const transitions: Record<string, SubscriptionTransition> = {
        'undefined:active': 'create',
        'active:expired': 'expire',
        'active:cancelled': 'cancel',
        'cancelled:expired': 'expire',
        'cancelled:active': 'reactivate',
        'expired:active': 'renew'
    }

    return transitions[`${from}:${to}`] || null
}

/**
 * Error thrown when an invalid state transition is attempted.
 */
export class StateTransitionError extends Error {
    constructor(
        public readonly from: SubscriptionStatus,
        public readonly to: SubscriptionStatus,
        public readonly subscriptionId?: string
    ) {
        super(`Invalid subscription state transition: ${from} -> ${to}${subscriptionId ? ` (subscription: ${subscriptionId})` : ''}`)
        this.name = 'StateTransitionError'
    }
}

/**
 * Determines the correct action when a user purchases a new subscription.
 * Handles the cancelled -> renewed transition properly.
 */
export function determineSubscriptionAction(
    currentStatus: SubscriptionStatus | null,
    currentEndDate: string | null
): {
    action: 'create_new' | 'reactivate' | 'extend' | 'replace'
    targetStatus: SubscriptionStatus
    reason: string
} {
    const now = new Date().toISOString()

    // No existing subscription - create new
    if (!currentStatus) {
        return {
            action: 'create_new',
            targetStatus: 'active',
            reason: 'No existing subscription'
        }
    }

    // Active subscription - replace it (user upgrading/changing plan)
    if (currentStatus === 'active') {
        return {
            action: 'replace',
            targetStatus: 'active',
            reason: 'Replacing active subscription with new plan'
        }
    }

    // Cancelled subscription - check if still valid for reactivation
    if (currentStatus === 'cancelled') {
        if (currentEndDate && currentEndDate > now) {
            // Cancelled but not expired - can reactivate
            return {
                action: 'reactivate',
                targetStatus: 'active',
                reason: 'Reactivating cancelled subscription before expiry'
            }
        } else {
            // Cancelled and expired - treat as new
            return {
                action: 'create_new',
                targetStatus: 'active',
                reason: 'Cancelled subscription has expired, creating new'
            }
        }
    }

    // Expired subscription - create new
    if (currentStatus === 'expired') {
        return {
            action: 'create_new',
            targetStatus: 'active',
            reason: 'Previous subscription expired, creating new'
        }
    }

    // Fallback
    return {
        action: 'create_new',
        targetStatus: 'active',
        reason: 'Fallback to new subscription'
    }
}

// ============================================
// SERVER-SIDE FUNCTIONS
// ============================================
// NOTE: Functions that require 'next/headers' have been moved to:
// lib/subscription-service-server.ts
//
// Import from there for server components and API routes:
// import { enforceStateTransition, handleCancelledToRenewed, expireSubscriptions } from '@/lib/subscription-service-server'
//

/**
 * Gets the consolidated features for a user based on their active subscription.
 */
export async function getTierFeatures(userId: string): Promise<TierFeatures> {
    const defaultFeatures: TierFeatures = {
        ...PLAN_FEATURES.FREE,
        planName: "Free",
        isElite: false
    }

    try {
        const today = new Date().toISOString()
        const { data: subscription } = await supabase
            .from('subscriptions')
            .select('plan_name, plan_duration')
            .eq('user_id', userId)
            .eq('status', 'active')
            .gt('end_date', today)
            .order('end_date', { ascending: false })
            .limit(1)
            .maybeSingle() // Use maybeSingle() to handle no subscription case

        if (!subscription) return defaultFeatures

        const name = (subscription.plan_name || subscription.plan_duration || "FREE").toUpperCase()
        const features = PLAN_FEATURES[name as keyof typeof PLAN_FEATURES]

        if (!features) return defaultFeatures

        return {
            ...features,
            planName: subscription.plan_name || "Free",
            isElite: name === "ELITE"
        }
    } catch (error) {
        console.error("Error fetching tier features:", error)
        return defaultFeatures
    }
}

/**
 * STRICTLY Checks if a user can post a new property.
 * Counts 'active' AND 'pending' properties to prevent abuse.
 * For paid properties, only counts if payment_expires_at is in the future.
 */
export async function checkPropertyLimit(userId: string): Promise<LimitCheckResult> {
    try {
        const now = new Date().toISOString()

        // 1. Get all active/pending properties for this user
        const { data: properties, error: countError } = await supabase
            .from('properties')
            .select('payment_status, payment_expires_at')
            .eq('owner_id', userId)
            .in('status', ['active', 'pending'])

        if (countError) throw countError

        // 2. Count properties with expiry validation:
        // - 'included' properties: always count
        // - 'paid' properties: only count if payment_expires_at > now
        // - 'expired' properties: don't count
        const currentCount = (properties || []).filter(p => {
            // Included properties (first property in plan) always count
            if (p.payment_status === 'included') return true

            // Paid properties only count if not expired
            if (p.payment_status === 'paid') {
                return p.payment_expires_at && p.payment_expires_at > now
            }

            // Any other status (including 'expired') doesn't count
            return false
        }).length

        // 2. Get Active Subscription
        const today = new Date().toISOString()
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select('plan_name, plan_duration, properties_limit')
            .eq('user_id', userId)
            .eq('status', 'active')
            .gt('end_date', today)
            .order('end_date', { ascending: false })
            .limit(1)
            .maybeSingle() // Use maybeSingle() to handle no subscription case

        // 3. Determine Limit
        let limit: number = PLAN_LIMITS.FREE // Explicitly type as number
        let planName = "Free"

        if (subscription) {
            if (subscription.properties_limit) {
                limit = subscription.properties_limit
            } else {
                // Determine limit based on plan name
                if (subscription.plan_name) {
                    const name = subscription.plan_name.toUpperCase()
                    if (name === "SILVER" || name === "1 MONTH") limit = PLAN_LIMITS.SILVER
                    else if (name === "GOLD" || name === "3 MONTHS") limit = PLAN_LIMITS.GOLD
                    else if (name === "PLATINUM" || name === "6 MONTHS") limit = PLAN_LIMITS.PLATINUM
                    else if (name === "ELITE" || name === "1 YEAR") limit = PLAN_LIMITS.ELITE
                } else {
                    // Fallback if plan_name is null, use plan_duration
                    const name = (subscription.plan_duration || "FREE").toUpperCase()
                    if (name === "SILVER" || name === "1 MONTH") limit = PLAN_LIMITS.SILVER
                    else if (name === "GOLD" || name === "3 MONTHS") limit = PLAN_LIMITS.GOLD
                    else if (name === "PLATINUM" || name === "6 MONTHS") limit = PLAN_LIMITS.PLATINUM
                    else if (name === "ELITE" || name === "1 YEAR") limit = PLAN_LIMITS.ELITE
                }
            }
            planName = subscription.plan_name || "Free"
        }

        const allowed = currentCount < limit

        return {
            allowed,
            limit,
            current: currentCount,
            planName,
            reason: allowed ? undefined : `You have reached your limit of ${limit} properties on the ${planName} plan.`
        }

    } catch (error) {
        console.error("Error checking property limit:", error)
        return {
            allowed: false,
            limit: 0,
            current: 0,
            planName: "Error",
            reason: "Could not verify subscription status."
        }
    }
}

