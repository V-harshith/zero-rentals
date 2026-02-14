"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Heart, MessageSquare, Bell } from "lucide-react"

interface TenantStatsProps {
    savedHomes: number
    activeInquiries: number
    newNotifications: number
}

export function TenantStats({
    savedHomes,
    activeInquiries,
    newNotifications
}: TenantStatsProps) {
    const stats = [
        {
            label: "Saved Properties",
            value: savedHomes,
            icon: Heart,
            bgColor: "bg-red-100",
            iconColor: "text-red-600"
        },
        {
            label: "Active Inquiries",
            value: activeInquiries,
            icon: MessageSquare,
            bgColor: "bg-blue-100",
            iconColor: "text-blue-600"
        },
        {
            label: "Notifications",
            value: newNotifications,
            icon: Bell,
            bgColor: "bg-amber-100",
            iconColor: "text-amber-600"
        }
    ]

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.map((stat) => {
                const Icon = stat.icon
                return (
                    <Card key={stat.label}>
                        <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                                    <p className="text-2xl font-bold">{stat.value}</p>
                                </div>
                                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                                    <Icon className={`h-5 w-5 ${stat.iconColor}`} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    )
}
