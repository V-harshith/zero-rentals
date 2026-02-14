'use server'

import { createRazorpayOrder, verifyRazorpaySignature } from "@/lib/payment-service"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { PLAN_LIMITS } from "@/lib/constants"

export async function initiatePlanPurchaseAction(
    userId: string,
    planName: string,
    amount: number,
    duration: string
) {
    try {
        const { order, error } = await createRazorpayOrder(amount, 'INR', {
            userId,
            planName,
            duration
        })
        if (error) throw error
        return { success: true, order }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function fulfillSubscriptionAction(data: {
    userId: string
    planName: string
    planDuration: string
    amount: number
    razorpayOrderId: string
    razorpayPaymentId: string
    razorpaySignature: string
}) {
    try {
        // 1. Verify Signature
        const isValid = verifyRazorpaySignature(
            data.razorpayOrderId,
            data.razorpayPaymentId,
            data.razorpaySignature
        )

        if (!isValid) {
            throw new Error("Invalid payment signature")
        }

        // 2. Calculate End Date
        const startDate = new Date()
        const endDate = new Date()
        if (data.planDuration.includes('month')) {
            const months = parseInt(data.planDuration)
            endDate.setMonth(endDate.getMonth() + months)
        } else if (data.planDuration.includes('year')) {
            endDate.setFullYear(endDate.getFullYear() + 1)
        } else {
            // Default fallback based on common plans
            if (data.planName === 'Silver') endDate.setMonth(endDate.getMonth() + 3)
            else if (data.planName === 'Gold') endDate.setMonth(endDate.getMonth() + 6)
            else if (data.planName === 'Platinum') endDate.setFullYear(endDate.getFullYear() + 1)
        }

        // 3. Map properties limit
        const limitMap: Record<string, number> = {
            'Free': 1,
            'Silver': 3,
            'Gold': 5,
            'Platinum': 10,
            'Elite': 999
        }
        const propertiesLimit = limitMap[data.planName] || 1

        // 4. Update Database (Atomic sequence)
        // Update existing active subscriptions to 'cancelled'
        await supabaseAdmin
            .from('subscriptions')
            .update({ status: 'cancelled' })
            .eq('user_id', data.userId)
            .eq('status', 'active')

        // Insert new subscription
        const { data: subscription, error: subError } = await supabaseAdmin
            .from('subscriptions')
            .insert([{
                user_id: data.userId,
                plan_name: data.planName,
                plan_duration: data.planDuration,
                amount: data.amount,
                status: 'active',
                properties_limit: propertiesLimit,
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString()
            }])
            .select()
            .single()

        if (subError) throw subError

        // Log payment
        await supabaseAdmin
            .from('payment_logs')
            .insert([{
                user_id: data.userId,
                subscription_id: subscription.id,
                amount: data.amount,
                transaction_id: data.razorpayPaymentId,
                status: 'success',
                payment_gateway: 'razorpay'
            }])

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

        return { success: true }
    } catch (error: any) {
        console.error("Fulfillment Error:", error)
        return { success: false, error: error.message }
    }
}
