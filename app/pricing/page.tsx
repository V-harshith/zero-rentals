"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Check, Star, Crown, Zap, ArrowLeft, Sparkles, Loader2 } from "lucide-react"
import { RazorpayCheckout } from "@/components/razorpay-checkout"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"

export default function PricingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get("redirect")
  const { user } = useAuth()
  const [creatingFree, setCreatingFree] = useState(false)
  const [hasActivePlan, setHasActivePlan] = useState(false)
  const [checkingPlan, setCheckingPlan] = useState(true)
  const isActivatingRef = useRef(false)

  // Determine redirect path after plan selection
  const postPlanRedirect = redirectTo === "post-property" ? "/post-property" : undefined

  // Check if user already has an active subscription
  const checkExistingSubscription = useCallback(async () => {
    if (!user) {
      setCheckingPlan(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('id, status, end_date')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .gt('end_date', new Date().toISOString())
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('Error checking subscription:', error)
        return
      }

      setHasActivePlan(!!data)
    } finally {
      setCheckingPlan(false)
    }
  }, [user])

  useEffect(() => {
    checkExistingSubscription()
  }, [checkExistingSubscription])

  const handleFreePlan = async () => {
    if (!user) {
      router.push("/login/owner")
      return
    }

    // Prevent duplicate activation attempts using ref to avoid closure issues
    if (isActivatingRef.current || creatingFree || hasActivePlan) {
      return
    }

    // Check if user already has an active plan
    if (hasActivePlan) {
      toast.info("You already have an active plan")
      return
    }

    isActivatingRef.current = true
    setCreatingFree(true)
    try {
      const res = await fetch("/api/subscriptions/create-free", { method: "POST" })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to activate free plan")
      }

      // Update local state to prevent further activation attempts
      setHasActivePlan(true)

      toast.success(data.message || "Free plan activated!")
      router.push(postPlanRedirect || "/post-property")
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Something went wrong"
      toast.error(message)
    } finally {
      setCreatingFree(false)
      isActivatingRef.current = false
    }
  }

  const plans = [
    {
      name: "Free",
      price: "₹0",
      duration: "Forever",
      icon: Star,
      iconBg: "bg-gradient-to-br from-gray-400 to-gray-600",
      description: "Perfect for getting started",
      features: [
        "1 property listing",
        "Max 5 photos per property",
        "Standard visibility",
        "Email support (48 hours)",
        "Valid for 30 days per listing",
      ],
      buttonText: "Get Started Free",
      buttonVariant: "outline" as const,
      popular: false,
    },
    {
      name: "Silver",
      price: "₹1,000",
      duration: "1 Month",
      icon: Zap,
      iconBg: "bg-gradient-to-br from-slate-400 to-slate-600",
      description: "Great for testing the waters",
      features: [
        "1 property listing",
        "Max 10 photos per property",
        "Featured in search results",
        "Basic analytics dashboard",
        "Email support (24 hours)",
        "Valid for 30 days",
      ],
      buttonText: "Choose Silver",
      buttonVariant: "default" as const,
      popular: false,
    },
    {
      name: "Gold",
      price: "₹2,700",
      duration: "3 Months",
      icon: Crown,
      iconBg: "bg-gradient-to-br from-yellow-400 via-yellow-500 to-amber-600",
      description: "Most popular for PG owners",
      features: [
        "1 property listing",
        "Max 15 photos per property",
        "Top featured placement",
        "Advanced analytics & insights",
        "Priority email support (12 hours)",
        "WhatsApp & phone inquiry",
        "Featured badge on listings",
        "Valid for 90 days",
      ],
      buttonText: "Choose Gold",
      buttonVariant: "default" as const,
      popular: true,
    },
    {
      name: "Platinum",
      price: "₹5,000",
      duration: "6 Months",
      icon: Crown,
      iconBg: "bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600",
      description: "Best for professional PG chains",
      features: [
        "1 property listing",
        "Max 20 photos per property",
        "Premium featured placement",
        "Complete analytics suite",
        "24/7 priority support",
        "Featured on homepage",
        "Valid for 180 days",
      ],
      buttonText: "Choose Platinum",
      buttonVariant: "default" as const,
      popular: false,
    },
    {
      name: "Elite",
      price: "₹9,000",
      duration: "1 Year",
      icon: Sparkles,
      iconBg: "bg-gradient-to-br from-purple-500 via-pink-500 to-rose-500",
      description: "Ultimate plan for large businesses",
      features: [
        "1 property listing",
        "Max 20 photos per property",
        "Highest visibility",
        "Dedicated account manager",
        "API access for integrations",
        "Valid for 365 days",
      ],
      buttonText: "Choose Elite",
      buttonVariant: "default" as const,
      popular: false,
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/zerorentals-logo.png"
                alt="ZeroRentals"
                width={40}
                height={40}
                className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0"
              />
              <span className="font-bold text-xl">ZeroRentals</span>
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Home</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12 md:py-16 lg:py-20">
        {/* Hero Section */}
        <div className="text-center mb-12 md:mb-16">
          <div className="inline-block mb-4">
            <span className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium">
              <Sparkles className="h-4 w-4" />
              Simple, Transparent Pricing
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 md:mb-6">
            Choose Your Perfect Plan
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-6 md:mb-8">
            List your PG, co-living space, or rental property with the right plan for your needs
          </p>
          <div className="inline-flex items-center gap-2 bg-green-500/10 text-green-700 dark:text-green-400 px-5 py-2.5 rounded-full text-sm font-medium">
            <Check className="h-4 w-4" />
            All prices include GST (18%)
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 max-w-[1600px] mx-auto mb-16 md:mb-20">
          {plans.map((plan) => {
            const Icon = plan.icon
            return (
              <Card 
                key={plan.name} 
                className={`relative group hover:shadow-xl transition-all duration-300 ${
                  plan.popular 
                    ? "border-2 border-primary shadow-lg ring-2 ring-primary/20" 
                    : "hover:scale-105 border"
                }`}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <div className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-xs font-bold shadow-lg whitespace-nowrap">
                      ⭐ MOST POPULAR
                    </div>
                  </div>
                )}
                
                <CardHeader className="pt-8 pb-6 px-5 text-center">
                  {/* Icon */}
                  <div className="flex items-center justify-center mb-4">
                    <div className={`p-3 rounded-xl ${plan.iconBg} shadow-lg`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  
                  <CardTitle className="text-xl font-bold mb-2">{plan.name}</CardTitle>
                  <CardDescription className="text-xs min-h-[36px]">
                    {plan.description}
                  </CardDescription>
                  
                  {/* Price */}
                  <div className="mt-5">
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-3xl font-bold">
                        {plan.price}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        /{plan.duration}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-5 pb-6 px-5">
                  {/* Features List */}
                  <ul className="space-y-2">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2 text-xs">
                        <div className="mt-0.5 flex-shrink-0">
                          <div className="h-4 w-4 rounded-full bg-green-500/10 flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 text-green-600 dark:text-green-400 stroke-[3]" />
                          </div>
                        </div>
                        <span className="text-foreground/80 leading-snug">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  {/* CTA Button */}
                  <div className="pt-3">
                    {plan.name === "Free" ? (
                      <Button
                        className="w-full"
                        variant={plan.buttonVariant}
                        onClick={handleFreePlan}
                        disabled={creatingFree || hasActivePlan || checkingPlan}
                      >
                        {checkingPlan ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Checking...
                          </>
                        ) : creatingFree ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Activating...
                          </>
                        ) : hasActivePlan ? (
                          <>
                            <Check className="mr-2 h-4 w-4" />
                            Active Plan
                          </>
                        ) : (
                          plan.buttonText
                        )}
                      </Button>
                    ) : (
                      <RazorpayCheckout
                        planName={plan.name}
                        amount={parseInt(plan.price.replace(/[₹,]/g, ""))}
                        duration={plan.duration}
                        buttonText={plan.buttonText}
                        variant={plan.buttonVariant}
                        redirectTo={postPlanRedirect}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* FAQ Section */}
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground">
              Everything you need to know about our pricing
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg">How does the subscription work?</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Choose a plan, make a one-time payment, and your properties will be listed for the plan duration. You
                can upgrade, downgrade, or cancel anytime.
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg">What payment methods do you accept?</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                We accept all major payment methods including credit/debit cards, UPI, net banking, and digital wallets
                through our secure payment gateway.
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg">Can I change my plan later?</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Yes! You can upgrade to a higher plan anytime. The price difference will be adjusted based on your
                remaining subscription period.
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg">What happens after my subscription expires?</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Your listings will move to basic visibility. You can renew your subscription anytime to regain featured
                placement and premium benefits.
              </CardContent>
            </Card>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-16 md:mt-20 text-center">
          <Card className="bg-gradient-to-br from-primary via-primary to-primary/90 text-primary-foreground border-0 max-w-3xl mx-auto overflow-hidden relative">
            <CardContent className="relative pt-12 pb-12 px-8">
              <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-90" />
              <h3 className="text-3xl font-bold mb-4">Still have questions?</h3>
              <p className="mb-8 text-lg text-primary-foreground/90 max-w-xl mx-auto">
                Our team is here to help you choose the right plan for your property business
              </p>
              <Button variant="secondary" size="lg" className="font-semibold" asChild>
                <Link href="/contact">Contact Us</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
