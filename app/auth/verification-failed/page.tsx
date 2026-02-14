"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { XCircle, ArrowLeft, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ResendVerification } from "@/components/resend-verification"

function VerificationFailedContent() {
    const searchParams = useSearchParams()
    const reason = searchParams.get("reason") || "unknown"
    const email = searchParams.get("email") || ""

    const getErrorMessage = () => {
        switch (reason) {
            case "missing_token":
                return "The verification link is incomplete. Please check your email and try again."
            case "invalid_token":
                return "This verification link is invalid or has already been used."
            case "expired":
                return "This verification link has expired. Please request a new one."
            case "server_error":
                return "Something went wrong on our end. Please try again later."
            default:
                return "Email verification failed. Please try again."
        }
    }

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

                <Card className="border-2 border-red-200">
                    <CardHeader className="text-center space-y-4">
                        <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                            <XCircle className="h-8 w-8 text-red-600" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl">Verification Failed</CardTitle>
                            <CardDescription className="mt-2">{getErrorMessage()}</CardDescription>
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                        {reason === "expired" && email && (
                            <div className="space-y-3">
                                <p className="text-sm text-center text-muted-foreground">
                                    Request a new verification link:
                                </p>
                                <ResendVerification email={email} />
                            </div>
                        )}

                        <div className="pt-4 border-t space-y-2">
                            <Link href="/login">
                                <Button variant="outline" className="w-full h-12">
                                    <ArrowLeft className="h-4 w-4 mr-2" />
                                    Back to Login
                                </Button>
                            </Link>
                            <Link href="/register/tenant">
                                <Button variant="ghost" className="w-full h-12">
                                    <Mail className="h-4 w-4 mr-2" />
                                    Create New Account
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

export default function VerificationFailedPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
            <VerificationFailedContent />
        </Suspense>
    )
}
