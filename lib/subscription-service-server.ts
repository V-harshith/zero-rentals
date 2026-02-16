'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
    SubscriptionStatus,
    TransitionContext,
    StateTransitionError,
    isValidTransition,
    getTransitionType,
    determineSubscriptionAction
} from './subscription-service'

/**
 * Enforces a valid state transition for a subscription.
 * This function should be called before any status update.
 *
 * @param subscriptionId The subscription ID
 * @param newStatus The target status
 * @param context Context about the transition
 * @returns The result of the transition
 * @throws StateTransitionError if transition is invalid
 */
export async function enforceStateTransition(
    subscriptionId: string,
    newStatus: SubscriptionStatus,
    context: TransitionContext
): Promise<{ success: boolean; previousStatus: SubscriptionStatus | null; error?: string }> {
    // Get current subscription status
    const cookieStore = await cookies()
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

    const { data: subscription, error: fetchError } = await supabaseAdmin
        .from('subscriptions')
        .select('id, status, user_id, end_date')
        .eq('id', subscriptionId)
        .single()

    if (fetchError) {
        return { success: false, previousStatus: null, error: `Failed to fetch subscription: ${fetchError.message}` }
    }

    const currentStatus = subscription.status as SubscriptionStatus

    // Validate transition
    if (!isValidTransition(currentStatus, newStatus)) {
        throw new StateTransitionError(currentStatus, newStatus, subscriptionId)
    }

    // Perform the update
    const { error: updateError } = await supabaseAdmin
        .from('subscriptions')
        .update({
            status: newStatus,
            updated_at: new Date().toISOString()
        })
        .eq('id', subscriptionId)

    if (updateError) {
        return { success: false, previousStatus: currentStatus, error: updateError.message }
    }

    // Log the transition (best effort - don't fail if logging fails)
    try {
        await supabaseAdmin
            .from('subscription_transitions')
            .insert({
                subscription_id: subscriptionId,
                user_id: subscription.user_id,
                from_status: currentStatus,
                to_status: newStatus,
                transition_type: getTransitionType(currentStatus, newStatus),
                reason: context.reason,
                triggered_by: context.triggeredBy,
                metadata: context.metadata || {}
            })
    } catch (logError) {
        // Non-fatal: transition succeeded but logging failed
        console.warn('Failed to log subscription transition:', logError)
    }

    return { success: true, previousStatus: currentStatus }
}

/**
 * Handles the cancelled -> renewed transition properly.
 * When a user with a cancelled subscription purchases a new plan before expiry,
 * this reactivates their subscription instead of creating a duplicate.
 *
 * @param userId The user ID
 * @param planDetails The new plan details
 * @returns The subscription result
 */
export async function handleCancelledToRenewed(
    userId: string,
    planDetails: {
        planName: string
        duration: string
        amount: number
        propertiesLimit: number
    }
): Promise<{
    success: boolean
    subscription?: { id: string; status: SubscriptionStatus; action: string }
    error?: string
}> {
    const cookieStore = await cookies()
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

    try {
        // Get user's most recent subscription
        const { data: existingSub } = await supabaseAdmin
            .from('subscriptions')
            .select('id, status, end_date, plan_name')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        const action = determineSubscriptionAction(
            existingSub?.status as SubscriptionStatus | null,
            existingSub?.end_date || null
        )

        // Calculate new dates
        const startDate = new Date()
        const endDate = new Date()

        const durationLower = planDetails.duration.toLowerCase()
        if (durationLower.includes('month')) {
            const months = parseInt(planDetails.duration.match(/\d+/)?.[0] || '1')
            endDate.setMonth(endDate.getMonth() + months)
        } else if (durationLower.includes('year')) {
            const years = parseInt(planDetails.duration.match(/\d+/)?.[0] || '1')
            endDate.setFullYear(endDate.getFullYear() + years)
        } else {
            endDate.setMonth(endDate.getMonth() + 1) // Default 1 month
        }

        if (action.action === 'reactivate' && existingSub) {
            // Reactivate the cancelled subscription
            const transitionResult = await enforceStateTransition(
                existingSub.id,
                'active',
                {
                    reason: `Reactivated with new plan: ${planDetails.planName}`,
                    triggeredBy: 'user',
                    metadata: {
                        previousPlan: existingSub.plan_name,
                        newPlan: planDetails.planName,
                        amount: planDetails.amount
                    }
                }
            )

            if (!transitionResult.success) {
                return { success: false, error: transitionResult.error }
            }

            // Update subscription details
            const { data: updatedSub, error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update({
                    plan_name: planDetails.planName,
                    plan_duration: planDetails.duration,
                    amount: planDetails.amount,
                    properties_limit: planDetails.propertiesLimit,
                    start_date: startDate.toISOString(),
                    end_date: endDate.toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingSub.id)
                .select()
                .single()

            if (updateError) {
                return { success: false, error: updateError.message }
            }

            return {
                success: true,
                subscription: {
                    id: updatedSub.id,
                    status: 'active',
                    action: 'reactivate'
                }
            }
        } else {
            // Create new subscription
            // First, properly transition any active subscription to expired
            if (existingSub?.status === 'active') {
                await enforceStateTransition(
                    existingSub.id,
                    'expired',
                    {
                        reason: 'Replaced by new subscription purchase',
                        triggeredBy: 'user',
                        metadata: { newPlan: planDetails.planName }
                    }
                )
            }

            const { data: newSub, error: insertError } = await supabaseAdmin
                .from('subscriptions')
                .insert({
                    user_id: userId,
                    plan_name: planDetails.planName,
                    plan_duration: planDetails.duration,
                    amount: planDetails.amount,
                    status: 'active',
                    properties_limit: planDetails.propertiesLimit,
                    start_date: startDate.toISOString(),
                    end_date: endDate.toISOString()
                })
                .select()
                .single()

            if (insertError) {
                return { success: false, error: insertError.message }
            }

            return {
                success: true,
                subscription: {
                    id: newSub.id,
                    status: 'active',
                    action: action.action
                }
            }
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: message }
    }
}

/**
 * Expires subscriptions that have passed their end date.
 * Called by the cron job.
 */
export async function expireSubscriptions(subscriptionIds: string[]): Promise<{
    success: boolean
    expired: number
    failed: number
    errors: string[]
}> {
    const cookieStore = await cookies()
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

    const results = { success: true, expired: 0, failed: 0, errors: [] as string[] }

    for (const id of subscriptionIds) {
        try {
            // Get current status
            const { data: sub } = await supabaseAdmin
                .from('subscriptions')
                .select('status')
                .eq('id', id)
                .single()

            if (!sub) {
                results.failed++
                results.errors.push(`Subscription ${id} not found`)
                continue
            }

            // Only expire active or cancelled subscriptions
            if (sub.status !== 'active' && sub.status !== 'cancelled') {
                continue // Skip already expired
            }

            await enforceStateTransition(
                id,
                'expired',
                {
                    reason: 'Subscription end date reached',
                    triggeredBy: 'cron'
                }
            )

            results.expired++
        } catch (error) {
            results.failed++
            results.errors.push(`Failed to expire ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
    }

    results.success = results.failed === 0
    return results
}
