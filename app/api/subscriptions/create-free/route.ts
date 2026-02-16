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

        // 3. Check if an active subscription already exists (idempotent)
        const { data: existingSub } = await supabaseAdmin
            .from('subscriptions')
            .select('id, plan_name, status')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .gt('end_date', new Date().toISOString())
            .limit(1)
            .maybeSingle()

        if (existingSub) {
            return NextResponse.json({
                success: true,
                message: 'Subscription already exists',
                plan: existingSub.plan_name
            })
        }

        // 4. Create free subscription (30 days) using upsert for idempotency
        // This handles race conditions where multiple requests arrive simultaneously
        const startDate = new Date()
        const endDate = new Date()
        endDate.setDate(endDate.getDate() + 30)

        const { data: subscription, error: upsertError } = await supabaseAdmin
            .from('subscriptions')
            .upsert({
                user_id: user.id,
                plan_name: 'Free',
                plan_duration: '30 days',
                amount: 0,
                status: 'active',
                properties_limit: 1,
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
            }, {
                onConflict: 'user_id', // Assumes unique constraint on user_id for active subscriptions
                ignoreDuplicates: false // Update if conflict
            })
            .select('id, plan_name')
            .single()

        if (upsertError) {
            // Check if subscription was created by another concurrent request
            const { data: raceConditionSub } = await supabaseAdmin
                .from('subscriptions')
                .select('id, plan_name, status')
                .eq('user_id', user.id)
                .eq('status', 'active')
                .gt('end_date', new Date().toISOString())
                .limit(1)
                .maybeSingle()

            if (raceConditionSub) {
                return NextResponse.json({
                    success: true,
                    message: 'Subscription already exists',
                    plan: raceConditionSub.plan_name
                })
            }

            console.error('Free subscription creation error:', upsertError)
            return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 })
        }

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
