"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useAuth } from "@/lib/auth-context"
import { Search, ArrowLeft } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { csrfFetch } from "@/lib/csrf-fetch"

export default function TenantLoginPage() {
    const { user, login, isLoading: authLoading } = useAuth()
    const router = useRouter()
    const searchParams = useSearchParams()
    const redirectTo = searchParams.get('redirectTo')
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)

    // Redirect logged-in users based on role
    useEffect(() => {
        if (!authLoading && user) {
            // If there's a redirectTo parameter, use it
            if (redirectTo) {
                router.replace(redirectTo)
                return
            }

            // Otherwise use default redirects
            const redirectPath = user.role === 'tenant' ? '/' : `/dashboard/${user.role}`
            router.replace(redirectPath)
        }
    }, [user, authLoading, router, redirectTo])

    // Show loading state while checking auth
    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-muted/30">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                    <p className="mt-4 text-muted-foreground">Loading...</p>
                </div>
            </div>
        )
    }

    // Prevent flash of content before redirect
    if (user) {
        return null
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        try {
            await login(email, password)
        } catch (error: any) {
            console.error("Login failed:", error)

            if (error.message?.includes("verify your email") || error.message === 'EMAIL_NOT_VERIFIED') {
                toast.error("Email not verified", {
                    description: "Please check your inbox or resend the verification email.",
                    action: {
                        label: "Resend Email",
                        onClick: async () => {
                            const toastId = toast.loading("Sending verification email...")
                            try {
                                const res = await csrfFetch('/api/auth/resend-verification', {
                                    method: 'POST',
                                    body: JSON.stringify({ email })
                                })
                                const data = await res.json()

                                if (!res.ok) {
                                    if (data.message === 'Email already verified') {
                                        toast.success("Email already verified! Please login.", { id: toastId })
                                        return
                                    }
                                    throw new Error(data.error || "Failed to send email")
                                }

                                toast.success("Verification email sent!", { id: toastId })
                            } catch (err: any) {
                                toast.error(err.message, { id: toastId })
                            }
                        }
                    }
                })
            } else {
                toast.error(error.message || "Login failed")
            }
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-4 relative">
            {/* Back to Home - Left positioned on desktop, top on mobile */}
            <Link
                href="/"
                className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors p-2 hover:bg-white/50 rounded-md absolute left-4 top-4 md:left-8 md:top-8"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to Home
            </Link>
            <div className="w-full max-w-md space-y-6 animate-fadeIn pt-8 md:pt-0">
                {/* Header with Logo */}
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
                    <div>
                        <h1 className="text-3xl font-bold">Welcome Back</h1>
                        <p className="text-muted-foreground mt-2">
                            Sign in to your tenant account
                        </p>
                    </div>
                </div>

                {/* Login Card */}
                <Card className="border-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Search className="h-5 w-5 text-primary" />
                            Tenant Login
                        </CardTitle>
                        <CardDescription>
                            Find your perfect rental property
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <label htmlFor="email" className="text-sm font-medium">
                                    Email Address
                                </label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="Enter your email address"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="h-12"
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label htmlFor="password" className="text-sm font-medium">
                                        Password
                                    </label>
                                    <Link
                                        href="/forgot-password"
                                        className="text-sm text-primary hover:underline"
                                    >
                                        Forgot password?
                                    </Link>
                                </div>
                                <PasswordInput
                                    id="password"
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="h-12"
                                />
                            </div>

                            <Button
                                type="submit"
                                className="w-full h-12"
                                size="lg"
                                disabled={isLoading}
                            >
                                {isLoading ? "Signing in..." : "Sign In"}
                            </Button>
                        </form>

                        {/* Links */}
                        <div className="mt-6 space-y-4">
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-background px-2 text-muted-foreground">
                                        Don't have an account?
                                    </span>
                                </div>
                            </div>

                            <Link href="/register/tenant">
                                <Button variant="outline" className="w-full h-12">
                                    Create Tenant Account
                                </Button>
                            </Link>

                            <div className="text-center space-y-2 text-sm">
                                <p className="text-muted-foreground">
                                    Are you a property owner?{" "}
                                    <Link href="/login/owner" className="text-primary hover:underline font-semibold">
                                        Login as Owner
                                    </Link>
                                </p>

                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
