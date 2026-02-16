"use client"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { initiatePlanPurchaseAction, fulfillSubscriptionAction, checkExistingPaymentAction } from "@/app/actions/payment-actions"
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

// Generate unique idempotency key for each payment attempt
function generateIdempotencyKey(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`
}

// Exponential backoff delay calculation
function getRetryDelay(attempt: number): number {
    const baseDelay = 1000 // 1 second
    const maxDelay = 10000 // 10 seconds
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
    return delay
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
    const currentIdempotencyKeyRef = useRef<string>("")
    const abortControllerRef = useRef<AbortController | null>(null)
    const router = useRouter()

    // Cleanup on unmount
    const cleanup = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
        }
        paymentInitiatedRef.current = false
        currentIdempotencyKeyRef.current = ""
        setLoading(false)
    }, [])

    // Retry wrapper with exponential backoff
    async function withRetry<T>(
        operation: () => Promise<T>,
        operationName: string,
        maxRetries: number = 3
    ): Promise<T> {
        let lastError: Error | null = null

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // Check if operation was aborted
                if (abortControllerRef.current?.signal.aborted) {
                    throw new Error("Payment cancelled")
                }

                return await operation()
            } catch (error: any) {
                lastError = error

                // Don't retry on user cancellation or certain errors
                if (error.message?.includes("cancelled") ||
                    error.message?.includes("already processed") ||
                    error.message?.includes("Invalid")) {
                    throw error
                }

                // Last attempt failed
                if (attempt === maxRetries - 1) {
                    throw error
                }

                // Wait before retrying
                const delay = getRetryDelay(attempt)
                await new Promise(resolve => setTimeout(resolve, delay))
            }
        }

        throw lastError || new Error(`${operationName} failed after ${maxRetries} attempts`)
    }

    const handlePayment = async () => {
        // Prevent duplicate payment initiation - strict check
        if (loading || paymentInitiatedRef.current) {
            return
        }

        if (!user) {
            router.push("/login/owner")
            return
        }

        if (amount === 0) {
            // Free plan - just redirect or handle accordingly
            router.push("/post-property")
            return
        }

        // Initialize abort controller for this payment attempt
        abortControllerRef.current = new AbortController()

        // Generate new idempotency key for this payment attempt
        currentIdempotencyKeyRef.current = generateIdempotencyKey()
        paymentInitiatedRef.current = true
        setLoading(true)

        try {
            // 1. Check for existing payment before creating new
            const existingPayment = await withRetry(
                () => checkExistingPaymentAction(user.id, planName),
                "Check existing payment",
                2
            )

            if (existingPayment?.hasRecentPayment) {
                toast.info("You have a recent payment in progress. Please wait or refresh the page.")
                return
            }

            if (existingPayment?.hasActiveSubscription) {
                toast.info("You already have an active subscription for this plan.")
                router.push(redirectTo || (user?.role === 'admin' ? '/dashboard/admin' : '/dashboard/owner'))
                return
            }

            // 2. Create Order with idempotency key
            const { success, order, error } = await withRetry(
                () => initiatePlanPurchaseAction(
                    user.id,
                    planName,
                    amount,
                    duration,
                    currentIdempotencyKeyRef.current
                ),
                "Create order"
            )

            if (!success || !order) {
                throw new Error(error || "Failed to initiate payment")
            }

            // 3. Load Razorpay Script
            const res = await loadScript("https://checkout.razorpay.com/v1/checkout.js")
            if (!res) {
                throw new Error("Razorpay SDK failed to load. Check your internet connection.")
            }

            // 4. Check if Razorpay is available
            if (typeof window.Razorpay !== 'function') {
                throw new Error("Razorpay SDK not initialized. Please refresh and try again.")
            }

            // 5. Check key is configured
            const razorpayKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
            if (!razorpayKey) {
                throw new Error("Payment gateway key not configured. Please contact support.")
            }

            // 6. Open Razorpay Modal
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
                        // Fulfill with retry logic for network resilience
                        const fulfillResult = await withRetry(
                            () => fulfillSubscriptionAction({
                                userId: user.id,
                                planName,
                                planDuration: duration,
                                amount,
                                razorpayOrderId: response.razorpay_order_id,
                                razorpayPaymentId: response.razorpay_payment_id,
                                razorpaySignature: response.razorpay_signature,
                                idempotencyKey: currentIdempotencyKeyRef.current,
                            }),
                            "Fulfill subscription"
                        )

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
                        // Reset processed set on error to allow retry
                        processedPayments.current.delete(response.razorpay_payment_id)
                    }
                },
                modal: {
                    ondismiss: function() {
                        // User closed the modal - cleanup
                        cleanup()
                        toast.info("Payment cancelled. You can try again when ready.")
                    },
                    confirm_close: true,
                    escape: false,
                },
                prefill: {
                    name: user.name,
                    email: user.email,
                },
                theme: {
                    color: "#0d9488", // teal-600
                },
                retry: {
                    enabled: true,
                    max_count: 3,
                },
            }

            const paymentObject = new window.Razorpay(options)

            // Handle payment failure
            paymentObject.on('payment.failed', function (response: { error: { description: string } }) {
                toast.error("Payment failed: " + response.error.description)
                cleanup()
            })

            paymentObject.open()

        } catch (error: any) {
            toast.error(error.message || "An error occurred during payment")
            cleanup()
        }
        // Note: We don't cleanup on success - that happens after redirect
    }

    const loadScript = (src: string) => {
        return new Promise((resolve) => {
            // Check if script already exists
            const existingScript = document.querySelector(`script[src="${src}"]`)
            if (existingScript) {
                resolve(true)
                return
            }

            const script = document.createElement("script")
            script.src = src
            script.async = true
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
