"use client"

import Link from "next/link"
import Image from "next/image"
import { CheckCircle2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export default function AlreadyVerifiedPage() {
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

                <Card className="border-2 border-blue-200">
                    <CardHeader className="text-center space-y-4">
                        <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                            <CheckCircle2 className="h-8 w-8 text-blue-600" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl">Already Verified</CardTitle>
                            <CardDescription className="mt-2">
                                Your email is already verified. You can login to your account.
                            </CardDescription>
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
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
