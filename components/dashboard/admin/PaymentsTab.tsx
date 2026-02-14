"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Loader2, IndianRupee } from "lucide-react"
import type { Payment } from "@/lib/types"

interface PaymentsTabProps {
    payments: Payment[]
    loading: boolean
}

export function PaymentsTab({ payments, loading }: PaymentsTabProps) {
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

    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0)

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>Payments ({payments.length})</CardTitle>
                    <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-lg">
                        <IndianRupee className="h-5 w-5" />
                        <span className="font-bold text-lg">
                            {totalRevenue.toLocaleString()}
                        </span>
                        <span className="text-sm">Total Revenue</span>
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
                                                    payment.status === 'success' ? 'default' : 'secondary'
                                                }
                                            >
                                                {payment.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {payment.created_at ? new Date(payment.created_at).toLocaleDateString() : 'N/A'}
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
