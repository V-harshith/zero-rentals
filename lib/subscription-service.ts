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
 */
export async function checkPropertyLimit(userId: string): Promise<LimitCheckResult> {
    try {
        // 1. Get Current Property Count (Active + Pending)
        const { count, error: countError } = await supabase
            .from('properties')
            .select('*', { count: 'exact', head: true })
            .eq('owner_id', userId)
            .in('status', ['active', 'pending'])

        if (countError) throw countError
        const currentCount = count || 0

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

