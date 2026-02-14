import { Home, Search, Heart } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface EmptyStateProps {
    icon?: React.ReactNode
    title: string
    description: string
    actionLabel?: string
    actionHref?: string
    onAction?: () => void
}

export function EmptyState({
    icon,
    title,
    description,
    actionLabel,
    actionHref,
    onAction,
}: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-6">
                {icon || <Search className="h-10 w-10 text-muted-foreground" />}
            </div>

            <h3 className="text-xl font-semibold mb-2">{title}</h3>
            <p className="text-muted-foreground mb-6 max-w-sm">{description}</p>

            {(actionLabel && (actionHref || onAction)) && (
                actionHref ? (
                    <Link href={actionHref}>
                        <Button className="h-12">{actionLabel}</Button>
                    </Link>
                ) : (
                    <Button onClick={onAction} className="h-12">{actionLabel}</Button>
                )
            )}
        </div>
    )
}

// Preset empty states
export function NoPropertiesFound() {
    return (
        <EmptyState
            icon={<Home className="h-10 w-10 text-muted-foreground" />}
            title="No properties found"
            description="We couldn't find any properties matching your criteria. Try adjusting your filters."
            actionLabel="Clear Filters"
            actionHref="/search"
        />
    )
}

export function NoFavorites() {
    return (
        <EmptyState
            icon={<Heart className="h-10 w-10 text-muted-foreground" />}
            title="No favorites yet"
            description="Start exploring properties and save your favorites for easy access later."
            actionLabel="Browse Properties"
            actionHref="/"
        />
    )
}

export function NoResults() {
    return (
        <EmptyState
            icon={<Search className="h-10 w-10 text-muted-foreground" />}
            title="No results"
            description="Try different search terms or browse all properties."
            actionLabel="View All Properties"
            actionHref="/"
        />
    )
}
