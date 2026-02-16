"use client"

import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { CheckCircle2, ArrowRight, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"

export default function EmailVerifiedPage() {
    const searchParams = useSearchParams()
    const [countdown, setCountdown] = useState(5)
    const [isRedirecting, setIsRedirecting] = useState(false)
    const [redirectError, setRedirectError] = useState<string | null>(null)
    const [sessionReady, setSessionReady] = useState(false)

    // Get redirect URL from query params or default to /login
    const redirectUrl = searchParams.get('redirect') || '/login'
    const role = searchParams.get('role')

    // Check if session is established
    const checkSession = useCallback(async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
                setSessionReady(true)
                return true
            }
            return false
        } catch (error) {
            return false
        }
    }, [])

    // Countdown timer
    useEffect(() => {
        const interval = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(interval)
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => clearInterval(interval)
    }, [])

    // Check session periodically
    useEffect(() => {
        // Check immediately
        checkSession()

        // Then check every second until we have a session
        const interval = setInterval(async () => {
            const hasSession = await checkSession()
            if (hasSession) {
                clearInterval(interval)
            }
        }, 1000)

        return () => clearInterval(interval)
    }, [checkSession])

    // Handle redirect when countdown reaches 0
    useEffect(() => {
        if (countdown <= 0 && !isRedirecting && !redirectError) {
            handleRedirect()
        }
    }, [countdown, isRedirecting, redirectError])

    const handleRedirect = async () => {
        if (isRedirecting) return

        setIsRedirecting(true)

        try {
            // Ensure we have a session before redirecting
            const { data: { session } } = await supabase.auth.getSession()

            if (!session) {
                // Wait up to 3 more seconds for session
                await new Promise(resolve => setTimeout(resolve, 3000))

                const { data: { session: retrySession } } = await supabase.auth.getSession()
                if (!retrySession) {
                    // No session - redirect to login page instead of showing error
                    window.location.href = '/login'
                    return
                }
            }

            // Use window.location for reliable navigation
            window.location.href = redirectUrl
        } catch (error: any) {
            setRedirectError(error.message || 'Failed to redirect. Please click the button below.')
            setIsRedirecting(false)
        }
    }

    // Role-specific messages
    const roleMessages: Record<string, string> = {
        owner: "You can now access your owner dashboard and start listing properties.",
        tenant: "You can now browse properties and save your favorites.",
        admin: "You can now access your admin dashboard."
    }
    const message = role ? roleMessages[role] : "You can now access all features of ZeroRentals."

    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
            <div className="w-full max-w-md space-y-6 animate-fadeIn">
                <div className="text-center space-y-4">
                    <Link href="/" className="inline-flex items-center justify-center gap-2 group">
                        <Image
                            src="/zerorentals-logo.png"
                            alt="ZeroRentals"
                            width={48}
                            height={48}
                            className="h-12 w-12 object-contain transition-transform group-hover:scale-110"
                        />
                        <span className="text-2xl font-bold">ZeroRentals</span>
                    </Link>
                </div>

                <Card className="border-2 border-green-200">
                    <CardHeader className="text-center space-y-4">
                        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                            <CheckCircle2 className="h-8 w-8 text-green-600" />
                        </div>
                        <CardTitle className="text-2xl">Email Verified!</CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-6 text-center">
                        <p className="text-muted-foreground">
                            {message}
                        </p>

                        {redirectError ? (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <AlertCircle className="h-5 w-5 text-red-600 mx-auto mb-2" />
                                <p className="text-sm text-red-700">{redirectError}</p>
                            </div>
                        ) : (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                {isRedirecting ? (
                                    <div className="flex items-center justify-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin text-green-600" />
                                        <p className="text-sm text-green-700">
                                            Redirecting to dashboard...
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-sm text-green-700">
                                        Redirecting in <span className="font-bold text-lg">{countdown}</span> seconds...
                                    </p>
                                )}
                            </div>
                        )}

                        {!sessionReady && !redirectError && (
                            <p className="text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 inline animate-spin mr-1" />
                                Establishing session...
                            </p>
                        )}

                        <Button
                            className="w-full h-12"
                            disabled={isRedirecting}
                            onClick={handleRedirect}
                        >
                            {isRedirecting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Redirecting...
                                </>
                            ) : (
                                <>
                                    Continue to Dashboard
                                    <ArrowRight className="h-4 w-4 ml-2" />
                                </>
                            )}
                        </Button>

                        {redirectError && (
                            <p className="text-xs text-muted-foreground">
                                If you continue to have issues, please try logging in manually.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
