"use client"

import React from "react"
import { AlertTriangle, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface ErrorBoundaryProps {
    children: React.ReactNode
}

interface ErrorBoundaryState {
    hasError: boolean
    error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("Error caught by boundary:", error, errorInfo)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
                    <div className="max-w-md w-full text-center space-y-6">
                        <div className="flex justify-center">
                            <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
                                <AlertTriangle className="h-10 w-10 text-destructive" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h1 className="text-3xl font-bold">Something went wrong</h1>
                            <p className="text-muted-foreground">
                                We encountered an unexpected error. Please try refreshing the page.
                            </p>
                        </div>

                        {process.env.NODE_ENV === "development" && this.state.error && (
                            <div className="bg-muted p-4 rounded-lg text-left">
                                <p className="text-sm font-mono text-destructive">
                                    {this.state.error.message}
                                </p>
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <Button
                                onClick={() => window.location.reload()}
                                className="h-12"
                            >
                                Refresh Page
                            </Button>
                            <Link href="/">
                                <Button variant="outline" className="h-12 w-full sm:w-auto">
                                    <Home className="h-4 w-4 mr-2" />
                                    Go Home
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}
