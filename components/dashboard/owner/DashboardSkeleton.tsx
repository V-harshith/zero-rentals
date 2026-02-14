"use client"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Granular loading skeleton for the owner dashboard
 * Provides visual feedback that matches the actual layout
 */
export function DashboardSkeleton() {
    return (
        <div className="space-y-8">
            {/* Support Panel Skeleton */}
            <div className="space-y-4">
                <Skeleton className="h-48 w-full rounded-lg" />
            </div>

            {/* Stats Grid Skeleton */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {[1, 2, 3, 4].map((i) => (
                    <Card key={i}>
                        <CardContent className="p-3 md:p-4">
                            <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-20" />
                                    <Skeleton className="h-8 w-12" />
                                </div>
                                <Skeleton className="h-10 w-10 rounded-lg" />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Quick Insights Skeleton */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Skeleton className="h-5 w-5 rounded-full" />
                        <Skeleton className="h-5 w-32" />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-start gap-3 rounded-lg p-4">
                                <Skeleton className="h-5 w-5 rounded-full" />
                                <div className="space-y-2 flex-1">
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-3 w-full" />
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Properties Tab Skeleton */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-9 w-28" />
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg"
                        >
                            <div className="flex items-center gap-4 mb-4 md:mb-0">
                                <Skeleton className="w-16 h-16 rounded-lg" />
                                <div className="space-y-2">
                                    <Skeleton className="h-5 w-48" />
                                    <Skeleton className="h-4 w-32" />
                                    <Skeleton className="h-4 w-24" />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 md:gap-4">
                                <Skeleton className="h-6 w-20" />
                                <Skeleton className="h-9 w-9 rounded-md" />
                                <Skeleton className="h-9 w-9 rounded-md" />
                                <Skeleton className="h-9 w-9 rounded-md" />
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    )
}

/**
 * Skeleton for the stats section only
 */
export function StatsSkeleton() {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                    <CardContent className="p-3 md:p-4">
                        <div className="flex items-start justify-between">
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-20" />
                                <Skeleton className="h-8 w-12" />
                            </div>
                            <Skeleton className="h-10 w-10 rounded-lg" />
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

/**
 * Skeleton for the properties list only
 */
export function PropertiesListSkeleton() {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-9 w-28" />
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg"
                    >
                        <div className="flex items-center gap-4 mb-4 md:mb-0">
                            <Skeleton className="w-16 h-16 rounded-lg" />
                            <div className="space-y-2">
                                <Skeleton className="h-5 w-48" />
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-4 w-24" />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 md:gap-4">
                            <Skeleton className="h-6 w-20" />
                            <Skeleton className="h-9 w-9 rounded-md" />
                            <Skeleton className="h-9 w-9 rounded-md" />
                            <Skeleton className="h-9 w-9 rounded-md" />
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}

/**
 * Skeleton for the support panel only
 */
export function SupportPanelSkeleton() {
    return (
        <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-lg" />
        </div>
    )
}
