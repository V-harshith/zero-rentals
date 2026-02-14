import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Property Expiry Cron Job
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
        
        // 1. Find all paid properties that have expired
        const { data: expiredProperties, error: fetchError } = await supabase
            .from('properties')
            .select('id, title, owner_id, payment_expires_at')
            .eq('payment_status', 'paid')
            .lt('payment_expires_at', now)
            .neq('status', 'expired')
            .neq('status', 'deleted')

        if (fetchError) {
            console.error('Error fetching expired properties:', fetchError)
            return NextResponse.json({ error: 'Failed to fetch properties' }, { status: 500 })
        }

        if (!expiredProperties || expiredProperties.length === 0) {
            return NextResponse.json({ 
                message: 'No expired properties found',
                processed: 0 
            })
        }

        console.log(`Found ${expiredProperties.length} expired properties`)

        // 2. Mark properties as expired
        const propertyIds = expiredProperties.map(p => p.id)
        const { error: updateError } = await supabase
            .from('properties')
            .update({ status: 'expired' })
            .in('id', propertyIds)

        if (updateError) {
            console.error('Error updating expired properties:', updateError)
            return NextResponse.json({ error: 'Failed to update properties' }, { status: 500 })
        }

        // 3. Get owner details for notification emails
        const ownerIds = [...new Set(expiredProperties.map(p => p.owner_id))]
        const { data: owners } = await supabase
            .from('users')
            .select('id, email, name')
            .in('id', ownerIds)

        // 4. Send renewal emails (if email service is configured)
        const emailsSent: string[] = []
        
        if (owners) {
            for (const owner of owners) {
                const ownerProperties = expiredProperties.filter(p => p.owner_id === owner.id)
                
                try {
                    // Import email service dynamically
                    const { sendPropertyExpiryEmail } = await import('@/lib/email-service')
                    
                    for (const property of ownerProperties) {
                        await sendPropertyExpiryEmail({
                            to: owner.email,
                            ownerName: owner.name,
                            propertyTitle: property.title,
                            propertyId: property.id
                        })
                        emailsSent.push(owner.email)
                    }
                } catch (emailError) {
                    console.error(`Failed to send expiry email to ${owner.email}:`, emailError)
                    // Continue processing other owners
                }
            }
        }

        console.log(`Processed ${propertyIds.length} expired properties, sent ${emailsSent.length} emails`)

        return NextResponse.json({
            success: true,
            message: `Processed ${propertyIds.length} expired properties`,
            processed: propertyIds.length,
            emailsSent: emailsSent.length
        })

    } catch (error: any) {
        console.error('Property expiry cron error:', error)
        return NextResponse.json(
            { error: error.message || 'Cron job failed' },
            { status: 500 }
        )
    }
}
