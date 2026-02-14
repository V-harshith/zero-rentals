import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function PropertyCardSkeleton() {
    return (
        <Card className="overflow-hidden animate-pulse">
            <div className="relative h-48 bg-gray-200" />
            <CardHeader>
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="h-4 bg-gray-200 rounded w-full" />
                <div className="h-4 bg-gray-200 rounded w-5/6" />
                <div className="flex gap-2">
                    <div className="h-6 bg-gray-200 rounded w-16" />
                    <div className="h-6 bg-gray-200 rounded w-16" />
                    <div className="h-6 bg-gray-200 rounded w-16" />
                </div>
                <div className="flex justify-between items-center pt-2">
                    <div className="h-8 bg-gray-200 rounded w-24" />
                    <div className="h-10 bg-gray-200 rounded w-28" />
                </div>
            </CardContent>
        </Card>
    );
}

export function PropertyDetailSkeleton() {
    return (
        <div className="container mx-auto px-4 py-8 space-y-8 animate-pulse">
            {/* Image Gallery Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="h-96 bg-gray-200 rounded-lg" />
                <div className="grid grid-cols-2 gap-4">
                    <div className="h-44 bg-gray-200 rounded-lg" />
                    <div className="h-44 bg-gray-200 rounded-lg" />
                    <div className="h-44 bg-gray-200 rounded-lg" />
                    <div className="h-44 bg-gray-200 rounded-lg" />
                </div>
            </div>

            {/* Title and Price Skeleton */}
            <div className="space-y-4">
                <div className="h-10 bg-gray-200 rounded w-3/4" />
                <div className="h-6 bg-gray-200 rounded w-1/2" />
                <div className="h-12 bg-gray-200 rounded w-48" />
            </div>

            {/* Stats Skeleton */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-24 bg-gray-200 rounded-lg" />
                ))}
            </div>

            {/* Description Skeleton */}
            <div className="space-y-3">
                <div className="h-6 bg-gray-200 rounded w-32" />
                <div className="h-4 bg-gray-200 rounded w-full" />
                <div className="h-4 bg-gray-200 rounded w-full" />
                <div className="h-4 bg-gray-200 rounded w-3/4" />
            </div>

            {/* Amenities Skeleton */}
            <div className="space-y-3">
                <div className="h-6 bg-gray-200 rounded w-32" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                        <div key={i} className="h-10 bg-gray-200 rounded" />
                    ))}
                </div>
            </div>

            {/* Owner Card Skeleton */}
            <div className="h-64 bg-gray-200 rounded-lg" />
        </div>
    );
}

export function DashboardSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            {/* Stats Cards Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-32 bg-gray-200 rounded-lg" />
                ))}
            </div>

            {/* Table Header Skeleton */}
            <div className="space-y-4">
                <div className="h-8 bg-gray-200 rounded w-48" />
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-20 bg-gray-200 rounded-lg" />
                    ))}
                </div>
            </div>
        </div>
    );
}

export function PropertyListSkeleton({ count = 6 }: { count?: number }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: count }).map((_, i) => (
                <PropertyCardSkeleton key={i} />
            ))}
        </div>
    );
}

export function SearchPageSkeleton() {
    return (
        <div className="container mx-auto px-4 py-8 space-y-6 animate-pulse">
            {/* Filter Bar Skeleton */}
            <div className="h-20 bg-gray-200 rounded-lg" />

            {/* Sort Controls Skeleton */}
            <div className="flex justify-between items-center">
                <div className="h-6 bg-gray-200 rounded w-32" />
                <div className="h-10 bg-gray-200 rounded w-48" />
            </div>

            {/* Results Grid Skeleton */}
            <PropertyListSkeleton count={9} />
        </div>
    );
}
