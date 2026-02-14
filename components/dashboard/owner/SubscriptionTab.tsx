"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check } from "lucide-react"
import { RazorpayCheckout } from "@/components/razorpay-checkout"

export interface Subscription {
    id: string
    user_id: string
    plan_name: string
    plan_duration: string
    status: 'active' | 'expired' | 'cancelled'
    start_date: string
    end_date: string
    created_at: string
}

export interface PricingPlan {
    planName: string
    duration: string
    price: number
    properties: string
    features: readonly string[]
    popular?: boolean
    best?: boolean
}

export interface SubscriptionTabProps {
    activeSubscription: Subscription | null
    pricingPlans: PricingPlan[]
}

export function SubscriptionTab({
    activeSubscription,
    pricingPlans
}: SubscriptionTabProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>Subscription Plans</CardTitle>
                    {activeSubscription && (
                        <div className="text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full border border-green-200">
                            Current Plan: <strong>{activeSubscription.plan_name}</strong> (
                            Expires: {new Date(activeSubscription.end_date).toLocaleDateString()}
                            )
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {pricingPlans.map((plan) => {
                        const isCurrentPlan = activeSubscription?.plan_name === plan.planName

                        return (
                            <Card
                                key={plan.duration}
                                className={`relative ${plan.popular ? "border-primary" : ""
                                    } ${plan.best ? "border-accent" : ""} ${isCurrentPlan ? "bg-green-50 border-green-500" : ""
                                    }`}
                            >
                                {/* Plan Badges */}
                                {plan.popular && !isCurrentPlan && (
                                    <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary">
                                        Most Popular
                                    </Badge>
                                )}
                                {plan.best && !isCurrentPlan && (
                                    <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-accent">
                                        Best Value
                                    </Badge>
                                )}
                                {isCurrentPlan && (
                                    <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-green-600">
                                        Active Plan
                                    </Badge>
                                )}

                                <CardContent className="p-6 pt-8">
                                    {/* Plan Details */}
                                    <h3 className="font-bold text-lg mb-2">{plan.duration}</h3>
                                    <p className="text-3xl font-bold text-primary mb-2">
                                        ₹{plan.price.toLocaleString()}
                                    </p>
                                    <p className="text-sm text-muted-foreground mb-4">
                                        {plan.properties}
                                    </p>

                                    {/* Features */}
                                    <ul className="space-y-2 mb-6">
                                        {plan.features.map((feature) => (
                                            <li key={feature} className="flex items-center gap-2 text-sm">
                                                <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    {/* Subscribe Button */}
                                    <RazorpayCheckout
                                        planName={plan.planName}
                                        amount={plan.price}
                                        duration={plan.duration}
                                        buttonText={isCurrentPlan ? "Current Plan" : "Subscribe"}
                                        variant={
                                            isCurrentPlan
                                                ? "outline"
                                                : plan.popular || plan.best
                                                    ? "default"
                                                    : "outline"
                                        }
                                    />
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}
