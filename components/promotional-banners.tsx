"use client"

import { useState } from "react"
import { X, Sparkles, TrendingUp, Crown } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"

export function PromotionalBanner() {
    const [isVisible, setIsVisible] = useState(true)
    const { user } = useAuth()

    // Don't show banner for logged-in users
    if (!isVisible || user) return null

    return (
        <div className="bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 text-white">
            <div className="container mx-auto px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                        <Sparkles className="h-5 w-5 flex-shrink-0 animate-pulse" />
                        <p className="text-sm md:text-base font-medium">
                            <span className="hidden sm:inline">🎉 Limited Time Offer: </span>
                            Get <strong>20% OFF</strong> on all annual plans! 
                            <span className="hidden md:inline"> List your property today.</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href="/pricing">
                            <Button 
                                size="sm" 
                                variant="secondary"
                                className="bg-white text-purple-600 hover:bg-gray-100 font-semibold hover:scale-105 hover:shadow-lg transition-all duration-300"
                            >
                                View Plans
                            </Button>
                        </Link>
                        <button
                            onClick={() => setIsVisible(false)}
                            className="p-1 hover:bg-white/20 rounded transition-all duration-200 hover:scale-110"
                            aria-label="Dismiss banner"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export function UpgradeBanner() {
    return (
        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg p-6 my-6">
            <div className="flex items-start gap-4">
                <div className="p-3 bg-white/20 rounded-full">
                    <Crown className="h-6 w-6" />
                </div>
                <div className="flex-1">
                    <h3 className="text-xl font-bold mb-2">Unlock Premium Features</h3>
                    <p className="text-white/90 mb-4">
                        Get featured placement, advanced analytics, and priority support
                    </p>
                    <Link href="/pricing">
                        <Button variant="secondary" className="bg-white text-blue-600 hover:bg-gray-100 hover:scale-105 hover:shadow-lg transition-all duration-300">
                            Upgrade Now
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    )
}

export function TrendingBanner() {
    return (
        <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg p-4 mb-4">
            <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 animate-bounce" />
                <div>
                    <p className="font-semibold">🔥 Trending Properties</p>
                    <p className="text-sm text-white/90">Most viewed properties this week</p>
                </div>
            </div>
        </div>
    )
}
