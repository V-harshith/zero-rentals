"use client"

import { Suspense } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ResendVerification } from "@/components/resend-verification"
import { useSearchParams } from "next/navigation"

function VerifyEmailContent() {
    const searchParams = useSearchParams()
    const email = searchParams.get("email") || ""

    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
            <div className="w-full max-w-md space-y-6 animate-fadeIn">
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
                </div>

                <Card className="border-2">
                    <CardHeader className="text-center space-y-4">
                        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                            <Mail className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl">Check Your Email</CardTitle>
                            <CardDescription className="mt-2">
                                We've sent a verification link to
                            </CardDescription>
                            {email && (
                                <p className="text-sm font-semibold text-foreground mt-1">{email}</p>
                            )}
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-6">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex gap-3">
                                <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                                <div className="space-y-2 text-sm">
                                    <p className="font-medium text-blue-900">
                                        What to do next:
                                    </p>
                                    <ol className="list-decimal list-inside space-y-1 text-blue-700">
                                        <li>Check your inbox for our email</li>
                                        <li>Click the verification link</li>
                                        <li>You'll be redirected to login</li>
                                    </ol>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <p className="text-sm text-center text-muted-foreground">
                                Didn't receive the email? Check your spam folder or
                            </p>
                            {email && <ResendVerification email={email} />}
                        </div>

                        <div className="pt-4 border-t">
                            <Link href="/login" className="block">
                                <Button variant="outline" className="w-full h-12">
                                    <ArrowLeft className="h-4 w-4 mr-2" />
                                    Back to Login
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>

                <p className="text-center text-xs text-muted-foreground">
                    The verification link expires in 24 hours
                </p>
            </div>
        </div>
    )
}

export default function VerifyEmailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
            <VerifyEmailContent />
        </Suspense>
    )
}
