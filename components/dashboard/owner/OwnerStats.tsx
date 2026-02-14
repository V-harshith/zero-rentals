"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Home, Check, Eye, TrendingUp, Lock } from "lucide-react"
import Link from "next/link"
import { ROUTES } from "@/lib/constants"

export interface OwnerStatsProps {
    totalProperties: number
    activeProperties: number
    totalViews: number
    avgViews: number
    hasAnalytics: boolean
}

export function OwnerStats({
    totalProperties,
    activeProperties,
    totalViews,
    avgViews,
    hasAnalytics
}: OwnerStatsProps) {
    return (
        <div className="relative">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {/* Total Properties - Always Visible */}
                <Card>
                    <CardContent className="p-3 md:p-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs md:text-sm text-muted-foreground">Total Properties</p>
                                <p className="text-xl md:text-2xl font-bold">{totalProperties}</p>
                            </div>
                            <div className="p-1.5 md:p-2 rounded-lg bg-blue-100 text-blue-600">
                                <Home className="h-4 w-4 md:h-5 md:w-5" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Active Properties - Always Visible */}
                <Card>
                    <CardContent className="p-3 md:p-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs md:text-sm text-muted-foreground">Active Properties</p>
                                <p className="text-xl md:text-2xl font-bold">{activeProperties}</p>
                            </div>
                            <div className="p-1.5 md:p-2 rounded-lg bg-green-100 text-green-600">
                                <Check className="h-4 w-4 md:h-5 md:w-5" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Total Views - Gated for Premium */}
                <Card className="relative overflow-hidden">
                    {!hasAnalytics && (
                        <div className="absolute inset-0 z-10 backdrop-blur-md bg-background/70 flex flex-col items-center justify-center gap-1">
                            <Lock className="h-4 w-4 text-primary" />
                            <span className="text-xs font-medium text-primary">Premium</span>
                            <Link href={ROUTES.PRICING}>
                                <Button variant="link" size="sm" className="text-[10px] p-0 h-auto text-primary">
                                    Upgrade Plan
                                </Button>
                            </Link>
                        </div>
                    )}
                    <CardContent className="p-3 md:p-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs md:text-sm text-muted-foreground">Total Views</p>
                                <p className="text-xl md:text-2xl font-bold">
                                    {hasAnalytics ? totalViews : "---"}
                                </p>
                            </div>
                            <div className="p-1.5 md:p-2 rounded-lg bg-purple-100 text-purple-600">
                                <Eye className="h-4 w-4 md:h-5 md:w-5" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Average Views - Gated for Premium */}
                <Card className="relative overflow-hidden">
                    {!hasAnalytics && (
                        <div className="absolute inset-0 z-10 backdrop-blur-md bg-background/70 flex flex-col items-center justify-center gap-1">
                            <Lock className="h-4 w-4 text-primary" />
                            <span className="text-xs font-medium text-primary">Premium</span>
                            <Link href={ROUTES.PRICING}>
                                <Button variant="link" size="sm" className="text-[10px] p-0 h-auto text-primary">
                                    Upgrade Plan
                                </Button>
                            </Link>
                        </div>
                    )}
                    <CardContent className="p-3 md:p-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs md:text-sm text-muted-foreground">Avg. Views</p>
                                <p className="text-xl md:text-2xl font-bold">
                                    {hasAnalytics ? avgViews : "---"}
                                </p>
                            </div>
                            <div className="p-1.5 md:p-2 rounded-lg bg-orange-100 text-orange-600">
                                <TrendingUp className="h-4 w-4 md:h-5 md:w-5" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
            
            {/* View Analytics Button for Premium Users */}
            {hasAnalytics && totalProperties > 0 && (
                <div className="mt-4">
                    <Link href={ROUTES.DASHBOARD_OWNER_ANALYTICS}>
                        <Button variant="outline" className="w-full">
                            <TrendingUp className="h-4 w-4 mr-2" />
                            View Detailed Analytics
                        </Button>
                    </Link>
                </div>
            )}
        </div>
    )
}

