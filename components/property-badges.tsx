import { Badge } from "@/components/ui/badge"
import { Crown, TrendingUp, Sparkles, Star, Shield } from "lucide-react"

interface PropertyBadgesProps {
    featured?: boolean
    adminFeatured?: boolean
    verified?: boolean
    views?: number
    className?: string
}

export function PropertyBadges({ featured, adminFeatured, verified, views = 0, className = "" }: PropertyBadgesProps) {
    const isTrending = views > 100 // Properties with 100+ views are trending

    return (
        <div className={`flex flex-wrap gap-2 ${className}`}>
            {adminFeatured && (
                <Badge className="bg-gradient-to-r from-yellow-400 to-amber-500 text-white border-0 gap-1">
                    <Star className="h-3 w-3 fill-white" />
                    Admin Pick
                </Badge>
            )}

            {featured && (
                <Badge className="bg-gradient-to-r from-purple-500 to-violet-600 text-white border-0 gap-1">
                    <Crown className="h-3 w-3" />
                    Premium
                </Badge>
            )}

            {verified && (
                <Badge className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-0 gap-1">
                    <Shield className="h-3 w-3" />
                    Verified
                </Badge>
            )}

            {isTrending && (
                <Badge className="bg-gradient-to-r from-orange-500 to-red-500 text-white border-0 gap-1 animate-pulse">
                    <TrendingUp className="h-3 w-3" />
                    Trending
                </Badge>
            )}
        </div>
    )
}

export function AdminFeaturedBadge() {
    return (
        <div className="absolute top-3 left-3 z-10">
            <Badge className="bg-gradient-to-r from-yellow-400 to-amber-500 text-white border-0 gap-1 shadow-lg">
                <Star className="h-3 w-3 fill-white" />
                Admin Pick
            </Badge>
        </div>
    )
}

export function PaidFeaturedBadge() {
    return (
        <div className="absolute top-3 left-3 z-10">
            <Badge className="bg-gradient-to-r from-purple-500 to-violet-600 text-white border-0 gap-1 shadow-lg">
                <Crown className="h-3 w-3" />
                Premium
            </Badge>
        </div>
    )
}

export function TrendingBadge() {
    return (
        <div className="absolute top-3 right-3 z-10">
            <Badge className="bg-gradient-to-r from-orange-500 to-red-500 text-white border-0 gap-1 shadow-lg animate-pulse">
                <TrendingUp className="h-3 w-3" />
                Hot
            </Badge>
        </div>
    )
}

export function VerifiedBadge() {
    return (
        <Badge className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-0 gap-1">
            <Star className="h-3 w-3 fill-white" />
            Verified
        </Badge>
    )
}
