import { NextRequest, NextResponse } from 'next/server'
import { expireSubscriptions } from '@/lib/subscription-service'

/**
 * Subscription Expiry Cron Job
 * Run this endpoint via a cron service (e.g., Vercel Cron, Supabase Edge Functions)
 * Recommended: Run daily at midnight
 *
 * Cron expression: 0 0 * * *
 */

export async function GET(request: NextRequest) {
    try {
        // Verify cron secret to prevent unauthorized calls
        const authHeader = request.headers.get('authorization')
        const cronSecret = process.env.CRON_SECRET

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { createServerClient } = await import('@supabase/ssr')
        const { cookies } = await import('next/headers')
        const cookieStore = await cookies()
        const supabase = createServerClient(
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

        const now = new Date().toISOString()

        // 1. Find all active and cancelled subscriptions that have expired
        const { data: expiredSubscriptions, error: fetchError } = await supabase
            .from('subscriptions')
            .select('id, user_id, plan_name, end_date, status')
            .in('status', ['active', 'cancelled'])
            .lt('end_date', now)

        if (fetchError) {
            console.error('Error fetching expired subscriptions:', fetchError)
            return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 })
        }

        if (!expiredSubscriptions || expiredSubscriptions.length === 0) {
            return NextResponse.json({
                message: 'No expired subscriptions found',
                processed: 0
            })
        }

        console.log(`Found ${expiredSubscriptions.length} expired subscriptions`)

        // 2. Use state machine to properly expire subscriptions
        const subscriptionIds = expiredSubscriptions.map(s => s.id)
        const expireResult = await expireSubscriptions(subscriptionIds)

        if (!expireResult.success) {
            console.error('Error expiring subscriptions:', expireResult.errors)
            // Continue processing - some may have succeeded
        }

        // 3. Mark properties from expired subscriptions as expired
        const ownerIds = [...new Set(expiredSubscriptions.map(s => s.user_id))]

        const { data: expiredProperties, error: propError } = await supabase
            .from('properties')
            .select('id, title, owner_id')
            .in('owner_id', ownerIds)
            .eq('status', 'active')

        if (propError) {
            console.error('Error fetching properties to expire:', propError)
        } else if (expiredProperties && expiredProperties.length > 0) {
            const propertyIds = expiredProperties.map(p => p.id)

            const { error: propUpdateError } = await supabase
                .from('properties')
                .update({ status: 'expired' })
                .in('id', propertyIds)

            if (propUpdateError) {
                console.error('Error updating expired properties:', propUpdateError)
            } else {
                console.log(`Expired ${propertyIds.length} properties due to subscription expiry`)
            }
        }

        // 4. Get owner details for notification emails
        const { data: owners } = await supabase
            .from('users')
            .select('id, email, name')
            .in('id', ownerIds)

        // 5. Send expiry emails (if email service is configured)
        const emailsSent: string[] = []

        if (owners) {
            for (const owner of owners) {
                try {
                    // Import email service dynamically
                    const { sendSubscriptionExpiryEmail } = await import('@/lib/email-service')

                    await sendSubscriptionExpiryEmail({
                        to: owner.email,
                        ownerName: owner.name,
                    })
                    emailsSent.push(owner.email)
                } catch (emailError) {
                    console.error(`Failed to send expiry email to ${owner.email}:`, emailError)
                    // Continue processing other owners
                }
            }
        }

        console.log(`Processed ${expireResult.expired} expired subscriptions, sent ${emailsSent.length} emails`)

        return NextResponse.json({
            success: expireResult.success,
            message: `Processed ${expireResult.expired} expired subscriptions`,
            processed: expireResult.expired,
            failed: expireResult.failed,
            errors: expireResult.errors,
            propertiesExpired: expiredProperties?.length || 0,
            emailsSent: emailsSent.length
        })

    } catch (error: any) {
        console.error('Subscription expiry cron error:', error)
        return NextResponse.json(
            { error: error.message || 'Cron job failed' },
            { status: 500 }
        )
    }
}
