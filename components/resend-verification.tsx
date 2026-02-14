"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { Mail, Loader2 } from "lucide-react"

interface ResendVerificationProps {
    email: string
    cooldownSeconds?: number
}

export function ResendVerification({ email, cooldownSeconds = 60 }: ResendVerificationProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [countdown, setCountdown] = useState(0)

    const handleResend = async () => {
        if (countdown > 0) {
            toast.error(`Please wait ${countdown} seconds before resending`)
            return
        }

        setIsLoading(true)

        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/confirmed`,
                },
            })

            if (error) throw error

            toast.success("Verification email sent! Check your inbox.", {
                description: "The email may take a few minutes to arrive.",
                duration: 5000,
            })

            // Start countdown
            setCountdown(cooldownSeconds)
            const interval = setInterval(() => {
                setCountdown((prev) => {
                    if (prev <= 1) {
                        clearInterval(interval)
                        return 0
                    }
                    return prev - 1
                })
            }, 1000)
        } catch (error: any) {
            console.error("Resend error:", error)
            toast.error("Failed to resend verification email", {
                description: error.message || "Please try again later.",
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Button
            onClick={handleResend}
            disabled={isLoading || countdown > 0}
            variant="outline"
            className="w-full h-12"
        >
            {isLoading ? (
                <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                </>
            ) : countdown > 0 ? (
                `Resend in ${countdown}s`
            ) : (
                <>
                    <Mail className="h-4 w-4 mr-2" />
                    Resend Verification Email
                </>
            )}
        </Button>
    )
}
