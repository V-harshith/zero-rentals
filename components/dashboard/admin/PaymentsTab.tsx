"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Loader2, IndianRupee, RefreshCw } from "lucide-react"
import type { Payment } from "@/lib/types"

interface PaymentsTabProps {
    payments: Payment[]
    loading: boolean
    onRefresh?: () => void
    lastUpdated?: Date | null
}

export function PaymentsTab({ payments, loading, onRefresh, lastUpdated }: PaymentsTabProps) {
    if (loading) {
        return (
            <Card>
                <CardContent className="py-8">
                    <div className="text-center">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                        <p className="mt-4 text-muted-foreground">Loading payments...</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    // Only count completed/successful payments toward revenue
    const totalRevenue = payments.reduce((sum, p) => {
        if (p.status === 'success' || p.status === 'completed') {
            return sum + p.amount
        }
        return sum
    }, 0)

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                        <CardTitle>Payments ({payments.length})</CardTitle>
                        {onRefresh && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onRefresh}
                                disabled={loading}
                                className="gap-2"
                            >
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                                Refresh
                            </Button>
                        )}
                    </div>
                    <div className="flex items-center gap-4">
                        {lastUpdated && (
                            <span className="text-sm text-muted-foreground">
                                Last updated: {lastUpdated.toLocaleTimeString()}
                            </span>
                        )}
                        <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-lg">
                            <IndianRupee className="h-5 w-5" />
                            <span className="font-bold text-lg">
                                {totalRevenue.toLocaleString()}
                            </span>
                            <span className="text-sm">Total Revenue</span>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {payments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        No payments found
                    </div>
                ) : (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>User</TableHead>
                                    <TableHead>Plan</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Method</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Date</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payments.map((payment) => (
                                    <TableRow key={payment.id}>
                                        <TableCell>
                                            <div>
                                                <p className="font-medium">{payment.user?.name || "Unknown"}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    {payment.user?.email || "N/A"}
                                                </p>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{payment.plan_name || 'N/A'}</Badge>
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            ₹{payment.amount.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="capitalize">
                                            {payment.payment_method || 'N/A'}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={
                                                    payment.status === 'success' || payment.status === 'completed'
                                                        ? 'default'
                                                        : payment.status === 'failed' || payment.status === 'refunded'
                                                            ? 'destructive'
                                                            : 'secondary'
                                                }
                                            >
                                                {payment.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {payment.created_at ? (
                                                <div>
                                                    <div>{new Date(payment.created_at).toLocaleDateString()}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {new Date(payment.created_at).toLocaleTimeString()}
                                                    </div>
                                                </div>
                                            ) : 'N/A'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
