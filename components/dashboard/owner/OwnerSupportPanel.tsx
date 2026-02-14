"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MessageSquare, Phone, ShieldCheck, UserCheck, Zap } from "lucide-react"
import { type TierFeatures } from "@/lib/subscription-service"

export interface OwnerSupportPanelProps {
    features: TierFeatures
}

export function OwnerSupportPanel({ features }: OwnerSupportPanelProps) {
    if (features.planName === "Free") return null

    return (
        <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    Premium Benefits
                    <Badge variant="secondary" className="ml-auto bg-primary/10 text-primary border-primary/20">
                        {features.planName} Tier
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* WhatsApp Access */}
                    {features.whatsappAccess && (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-background border shadow-sm">
                            <div className="p-2 rounded-md bg-green-100 text-green-600">
                                <MessageSquare className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold">WhatsApp Group</p>
                                <p className="text-xs text-muted-foreground mb-2">Direct access to tenant inquiries</p>
                                <Button size="sm" variant="outline" className="h-7 text-xs border-green-200 hover:bg-green-50 text-green-700">
                                    Join Group
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Priority Support */}
                    {features.prioritySupport && (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-background border shadow-sm">
                            <div className="p-2 rounded-md bg-blue-100 text-blue-600">
                                <Zap className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold">Priority Support</p>
                                <p className="text-xs text-muted-foreground mb-2">2-hour response guarantee</p>
                                <Button size="sm" variant="outline" className="h-7 text-xs border-blue-200 hover:bg-blue-50 text-blue-700">
                                    Contact Support
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Dedicated Manager */}
                    {features.isElite && (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-background border shadow-sm">
                            <div className="p-2 rounded-md bg-purple-100 text-purple-600">
                                <UserCheck className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold">Dedicated Manager</p>
                                <p className="text-xs text-muted-foreground mb-2">Your personal account expert</p>
                                <Button size="sm" variant="outline" className="h-7 text-xs border-purple-200 hover:bg-purple-50 text-purple-700">
                                    Call Manager
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
