"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Users, Home, IndianRupee, TrendingUp } from "lucide-react"

interface AdminStatsProps {
    totalUsers: number
    totalProperties: number
    totalRevenue: number
    pendingApprovals: number
}

export function AdminStats({
    totalUsers,
    totalProperties,
    totalRevenue,
    pendingApprovals
}: AdminStatsProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Total Users */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Total Users</p>
                            <p className="text-2xl font-bold">{totalUsers}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                            <Users className="h-5 w-5" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Total Properties */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Total Properties</p>
                            <p className="text-2xl font-bold">{totalProperties}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-green-100 text-green-600">
                            <Home className="h-5 w-5" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Total Revenue */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Total Revenue</p>
                            <p className="text-2xl font-bold text-primary">₹{totalRevenue.toLocaleString()}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
                            <IndianRupee className="h-5 w-5" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Pending Approvals */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Pending Approvals</p>
                            <p className="text-2xl font-bold">{pendingApprovals}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-orange-100 text-orange-600">
                            <TrendingUp className="h-5 w-5" />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
