"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Search, Heart, Home } from "lucide-react"
import Link from "next/link"

export function QuickActions() {
    const actions = [
        {
            href: "/search",
            icon: Search,
            title: "Search",
            description: "Find properties",
            bgColor: "bg-primary/10",
            iconColor: "text-primary"
        },
        {
            href: "/dashboard/tenant",
            icon: Heart,
            title: "Favorites",
            description: "Saved properties",
            bgColor: "bg-red-100",
            iconColor: "text-red-500"
        },
        {
            href: "/profile/tenant",
            icon: Home,
            title: "Profile",
            description: "Your preferences",
            bgColor: "bg-green-100",
            iconColor: "text-green-500"
        }
    ]

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {actions.map((action) => {
                const Icon = action.icon
                return (
                    <Link key={action.href} href={action.href}>
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className={`p-2 rounded-lg ${action.bgColor}`}>
                                    <Icon className={`h-6 w-6 ${action.iconColor}`} />
                                </div>
                                <div>
                                    <p className="font-semibold">{action.title}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {action.description}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                )
            })}
        </div>
    )
}
