"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { initiatePlanPurchaseAction, fulfillSubscriptionAction } from "@/app/actions/payment-actions"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

interface RazorpayCheckoutProps {
    planName: string
    amount: number
    duration: string
    buttonText: string
    variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive"
    redirectTo?: string
}

export function RazorpayCheckout({
    planName,
    amount,
    duration,
    buttonText,
    variant = "default",
    redirectTo
}: RazorpayCheckoutProps) {
    const { user } = useAuth()
    const [loading, setLoading] = useState(false)
    const paymentInitiatedRef = useRef(false)
    const processedPayments = useRef(new Set<string>())
    const router = useRouter()

    const handlePayment = async () => {
        // Prevent duplicate payment initiation
        if (loading || paymentInitiatedRef.current) return

        if (!user) {
            router.push("/login/owner")
            return
        }

        if (amount === 0) {
            // Free plan - just redirect or handle accordingly
            router.push("/post-property")
            return
        }

        paymentInitiatedRef.current = true
        setLoading(true)

        try {
            // 1. Create Order
            const { success, order, error } = await initiatePlanPurchaseAction(user.id, planName, amount, duration)

            if (!success || !order) {
                throw new Error(error || "Failed to initiate payment")
            }

            // 2. Load Razorpay Script
            const res = await loadScript("https://checkout.razorpay.com/v1/checkout.js")
            if (!res) {
                throw new Error("Razorpay SDK failed to load. Check your internet connection.")
            }

            // 3. Check if Razorpay is available
            if (typeof window.Razorpay !== 'function') {
                throw new Error("Razorpay SDK not initialized. Please refresh and try again.")
            }

            // 4. Check key is configured
            const razorpayKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
            if (!razorpayKey) {
                throw new Error("Payment gateway key not configured. Please contact support.")
            }

            // 5. Open Razorpay Modal
            const options = {
                key: razorpayKey,
                amount: Number(order.amount),
                currency: order.currency,
                name: "ZeroRentals",
                description: `${planName} Plan - ${duration}`,
                image: "/zerorentals-logo.png",
                order_id: order.id,
                handler: async function (response: {
                    razorpay_payment_id: string;
                    razorpay_order_id: string;
                    razorpay_signature: string;
                }) {
                    // Prevent duplicate processing of same payment
                    if (processedPayments.current.has(response.razorpay_payment_id)) {
                        return
                    }
                    processedPayments.current.add(response.razorpay_payment_id)

                    try {
                        const fulfillResult = await fulfillSubscriptionAction({
                            userId: user.id,
                            planName,
                            planDuration: duration,
                            amount,
                            razorpayOrderId: response.razorpay_order_id,
                            razorpayPaymentId: response.razorpay_payment_id,
                            razorpaySignature: response.razorpay_signature,
                        })

                        if (fulfillResult.success) {
                            toast.success("Subscription activated successfully!")
                            // Redirect to specified path or dashboard
                            const targetDashboard = redirectTo || (user?.role === 'admin' ? '/dashboard/admin' : '/dashboard/owner')
                            router.push(targetDashboard)
                        } else {
                            throw new Error(fulfillResult.error)
                        }
                    } catch (err: any) {
                        toast.error("Payment verification failed: " + err.message)
                    }
                },
                prefill: {
                    name: user.name,
                    email: user.email,
                },
                theme: {
                    color: "#0d9488", // teal-600
                },
            }

            const paymentObject = new window.Razorpay(options)
            paymentObject.open()

        } catch (error: any) {
            console.error(error)
            toast.error(error.message || "An error occurred during payment")
        } finally {
            setLoading(false)
            paymentInitiatedRef.current = false
        }
    }

    const loadScript = (src: string) => {
        return new Promise((resolve) => {
            const script = document.createElement("script")
            script.src = src
            script.onload = () => resolve(true)
            script.onerror = () => resolve(false)
            document.body.appendChild(script)
        })
    }

    return (
        <Button
            className="w-full"
            variant={variant}
            onClick={handlePayment}
            disabled={loading}
        >
            {loading ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                </>
            ) : (
                buttonText
            )}
        </Button>
    )
}
