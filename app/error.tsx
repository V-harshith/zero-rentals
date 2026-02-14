"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AlertTriangle } from "lucide-react"

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error("Error:", error)
    }, [error])

    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
            <Card className="max-w-md w-full">
                <CardContent className="pt-6">
                    <div className="text-center space-y-4">
                        <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
                            <AlertTriangle className="h-8 w-8 text-destructive" />
                        </div>

                        <div className="space-y-2">
                            <h1 className="text-2xl font-bold">Something went wrong!</h1>
                            <p className="text-muted-foreground">
                                We encountered an error while loading this page.
                            </p>
                        </div>

                        {process.env.NODE_ENV === "development" && (
                            <div className="p-4 bg-muted rounded-lg text-left">
                                <p className="text-sm font-mono text-destructive break-all">
                                    {error.message}
                                </p>
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-3 pt-4">
                            <Button onClick={reset} className="flex-1">
                                Try Again
                            </Button>
                            <Button variant="outline" className="flex-1" onClick={() => window.location.href = "/"}>
                                Go Home
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
