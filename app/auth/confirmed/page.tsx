"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { CheckCircle2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function EmailConfirmedPage() {
    const router = useRouter()
    const [countdown, setCountdown] = useState(5)

    useEffect(() => {
        const interval = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(interval)
                    router.push("/login")
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => clearInterval(interval)
    }, [router])

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

                <Card className="border-2 border-green-200">
                    <CardHeader className="text-center space-y-4">
                        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                            <CheckCircle2 className="h-8 w-8 text-green-600" />
                        </div>
                        <CardTitle className="text-2xl">Email Verified!</CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-6 text-center">
                        <p className="text-muted-foreground">
                            Your email has been successfully verified. You can now access all features of ZeroRentals.
                        </p>

                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <p className="text-sm text-green-700">
                                Redirecting to login in <span className="font-bold text-lg">{countdown}</span> seconds...
                            </p>
                        </div>

                        <Link href="/login">
                            <Button className="w-full h-12">
                                Continue to Login
                                <ArrowRight className="h-4 w-4 ml-2" />
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
