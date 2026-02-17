import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * POST /api/subscriptions/create-free
 * 
 * Creates a free-tier subscription for the authenticated owner.
 * Called when an owner selects the "Free" plan on the pricing page.
 * Idempotent: if a subscription already exists, returns success without creating a duplicate.
 */
export async function POST() {
    try {
        // 1. Authenticate using the project's standard pattern
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

        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 2. Verify role is owner
        const { data: dbUser } = await supabaseAdmin
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()

        if (!dbUser || dbUser.role !== 'owner') {
            return NextResponse.json({ error: 'Only owners can create subscriptions' }, { status: 403 })
        }

        // 3. Check if ANY active subscription already exists (CRITICAL FIX)
        // This prevents free plan from overwriting paid plans
        const { data: existingSub } = await supabaseAdmin
            .from('subscriptions')
            .select('id, plan_name, status, amount, end_date')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .gt('end_date', new Date().toISOString())
            .order('end_date', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (existingSub) {
            // If existing subscription is paid, don't allow free plan creation
            if (existingSub.amount > 0) {
                return NextResponse.json({
                    success: true,
                    message: 'You already have an active paid plan',
                    plan: existingSub.plan_name,
                    isPaid: true
                })
            }
            // If it's already a free plan, return success
            return NextResponse.json({
                success: true,
                message: 'Free subscription already active',
                plan: existingSub.plan_name
            })
        }

        // 4. Create free subscription using atomic database function
        // This prevents race conditions and duplicate subscriptions
        const startDate = new Date()
        const endDate = new Date()
        endDate.setDate(endDate.getDate() + 30)

        const { data: subscriptionResult, error: createError } = await supabaseAdmin
            .rpc('get_or_create_subscription', {
                p_user_id: user.id,
                p_plan_name: 'Free',
                p_plan_duration: '30 days',
                p_amount: 0,
                p_properties_limit: 1,
                p_start_date: startDate.toISOString(),
                p_end_date: endDate.toISOString()
            })

        if (createError) {
            console.error('Free subscription creation error:', createError)
            // Fallback: check if subscription exists (race condition handling)
            const { data: raceConditionSub } = await supabaseAdmin
                .from('subscriptions')
                .select('id, plan_name, status, amount')
                .eq('user_id', user.id)
                .eq('status', 'active')
                .gt('end_date', new Date().toISOString())
                .order('end_date', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (raceConditionSub) {
                return NextResponse.json({
                    success: true,
                    message: raceConditionSub.amount > 0 ? 'Paid subscription active' : 'Subscription already exists',
                    plan: raceConditionSub.plan_name,
                    isPaid: raceConditionSub.amount > 0
                })
            }

            return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 })
        }

        // Parse the result
        const result = subscriptionResult as { id: string; plan_name: string; is_new: boolean; isPaid?: boolean }

        return NextResponse.json({
            success: true,
            message: result.is_new ? 'Free subscription created' : (result.isPaid ? 'Paid plan already active' : 'Subscription already exists'),
            plan: result.plan_name,
            subscriptionId: result.id,
            isNew: result.is_new
        })

        return NextResponse.json({
            success: true,
            message: 'Free subscription created',
            plan: subscription.plan_name,
            subscriptionId: subscription.id
        })

    } catch (error) {
        console.error('Unexpected error creating free subscription:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
