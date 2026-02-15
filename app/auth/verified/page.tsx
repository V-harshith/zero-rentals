"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { CheckCircle2, ArrowRight, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"

export default function EmailVerifiedPage() {
    const router = useRouter()
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
                console.log('[VERIFIED] Session established, ready to redirect')
                setSessionReady(true)
                return true
            }
            console.log('[VERIFIED] No session yet, waiting...')
            return false
        } catch (error) {
            console.error('[VERIFIED] Error checking session:', error)
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
        console.log('[VERIFIED] Attempting redirect to:', redirectUrl)

        try {
            // Ensure we have a session before redirecting
            const { data: { session } } = await supabase.auth.getSession()

            if (!session) {
                console.warn('[VERIFIED] No session found, waiting...')
                // Wait up to 3 more seconds for session
                await new Promise(resolve => setTimeout(resolve, 3000))

                const { data: { session: retrySession } } = await supabase.auth.getSession()
                if (!retrySession) {
                    throw new Error('Session not established. Please log in manually.')
                }
            }

            // Try Next.js router first
            try {
                await router.push(redirectUrl)
                // If router.push doesn't throw but also doesn't navigate,
                // we need to check if we're still on this page after a short delay
                setTimeout(() => {
                    if (window.location.pathname.includes('/auth/verified')) {
                        console.log('[VERIFIED] Router push may have failed, trying window.location')
                        window.location.href = redirectUrl
                    }
                }, 1000)
            } catch (routerError) {
                console.error('[VERIFIED] Router push failed:', routerError)
                // Fallback to window.location
                window.location.href = redirectUrl
            }
        } catch (error: any) {
            console.error('[VERIFIED] Redirect failed:', error)
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

                        <Link href={redirectUrl} onClick={(e) => {
                            e.preventDefault()
                            handleRedirect()
                        }}>
                            <Button className="w-full h-12" disabled={isRedirecting}>
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
                        </Link>

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
