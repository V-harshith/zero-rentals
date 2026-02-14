"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Search, Mail, Phone, MessageCircle } from "lucide-react"
import Link from "next/link"

const FAQ_CATEGORIES = [
    {
        title: "Getting Started",
        questions: [
            {
                q: "How do I search for properties?",
                a: "Use the search bar on the homepage to enter your preferred location. You can filter by property type (PG/Co-living/Rent), price range, amenities, and more on the search results page."
            },
            {
                q: "Is registration required to view properties?",
                a: "No, you can browse all properties without registration. However, to contact owners or save favorites, you'll need to create a free account."
            },
            {
                q: "How do I create an account?",
                a: "Click 'Login' in the header, then select 'Login as Tenant' or 'Login as Owner'. On the login page, click 'Register' to create a new account."
            }
        ]
    },
    {
        title: "For Tenants",
        questions: [
            {
                q: "How do I contact a property owner?",
                a: "On any property detail page, click the 'Contact Owner' button. Fill in your details and message, and the owner will receive your inquiry."
            },
            {
                q: "Can I save properties to view later?",
                a: "Yes! Click the heart icon on any property card to add it to your favorites. Access all saved properties from your dashboard."
            },
            {
                q: "How do I know if a property is still available?",
                a: "Properties show an 'Available' badge. We recommend contacting the owner directly to confirm current availability."
            },
            {
                q: "What should I ask the owner before visiting?",
                a: "Ask about current availability, exact rent amount, deposit requirements, included amenities, house rules, and schedule a visit."
            }
        ]
    },
    {
        title: "For Owners",
        questions: [
            {
                q: "How do I list my property?",
                a: "After logging in as an owner, go to your dashboard and click 'Add Property'. Fill in all details across the 5-step form and submit."
            },
            {
                q: "Is there a fee to list properties?",
                a: "Yes, we offer subscription plans starting from ₹1,000/month. Check the Pricing page for all plans and features."
            },
            {
                q: "How many properties can I list?",
                a: "The number depends on your subscription plan. Basic plan allows 1 property, while higher plans allow up to 10 properties."
            },
            {
                q: "Can I edit my property listing?",
                a: "Yes! Go to your dashboard, find the property, and click 'Edit' to update any details including photos, price, and amenities."
            },
            {
                q: "How do I manage inquiries?",
                a: "All tenant inquiries appear in your dashboard. You can view messages, respond, and manage all communications from there."
            }
        ]
    },
    {
        title: "Payments & Subscriptions",
        questions: [
            {
                q: "What payment methods do you accept?",
                a: "We accept all major credit/debit cards, UPI, net banking, and digital wallets through our secure payment gateway."
            },
            {
                q: "Can I cancel my subscription?",
                a: "Yes, you can cancel anytime from your dashboard. Your listings will remain active until the end of your current billing period."
            },
            {
                q: "Do you offer refunds?",
                a: "Refunds are available within 24 hours of purchase. Please check our Refund Policy for complete details."
            },
            {
                q: "How do I upgrade my plan?",
                a: "Go to your dashboard, click on 'Subscription', and select 'Upgrade Plan'. You'll only pay the difference for the remaining period."
            }
        ]
    },
    {
        title: "Technical Support",
        questions: [
            {
                q: "I forgot my password. What should I do?",
                a: "Click 'Forgot Password' on the login page. Enter your email and we'll send you a password reset link."
            },
            {
                q: "Why can't I upload photos?",
                a: "Ensure your images are in JPG or PNG format and under 5MB each. Clear your browser cache and try again. If the issue persists, contact support."
            },
            {
                q: "The website is not loading properly",
                a: "Try clearing your browser cache, using a different browser, or checking your internet connection. Contact support if the problem continues."
            },
            {
                q: "How do I report a problem with a listing?",
                a: "Click the 'Report' button on the property page or contact our support team with the property details."
            }
        ]
    }
]

export default function HelpPage() {
    const [searchQuery, setSearchQuery] = useState("")
    const [filteredCategories, setFilteredCategories] = useState(FAQ_CATEGORIES)

    const handleSearch = (query: string) => {
        setSearchQuery(query)

        if (!query.trim()) {
            setFilteredCategories(FAQ_CATEGORIES)
            return
        }

        const filtered = FAQ_CATEGORIES.map(category => ({
            ...category,
            questions: category.questions.filter(
                item =>
                    item.q.toLowerCase().includes(query.toLowerCase()) ||
                    item.a.toLowerCase().includes(query.toLowerCase())
            )
        })).filter(category => category.questions.length > 0)

        setFilteredCategories(filtered)
    }

    return (
        <div className="min-h-screen bg-muted/30 py-8">
            <div className="container mx-auto px-4 max-w-4xl">
                {/* Header */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold mb-4">Help Center</h1>
                    <p className="text-lg text-muted-foreground mb-8">
                        Find answers to common questions
                    </p>

                    {/* Search */}
                    <div className="relative max-w-2xl mx-auto">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                            placeholder="Search for help..."
                            value={searchQuery}
                            onChange={(e) => handleSearch(e.target.value)}
                            className="pl-10 h-12"
                        />
                    </div>
                </div>

                {/* FAQ Sections */}
                <div className="space-y-8">
                    {filteredCategories.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center">
                                <p className="text-muted-foreground">
                                    No results found for "{searchQuery}". Try different keywords or contact support.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        filteredCategories.map((category, idx) => (
                            <Card key={idx}>
                                <CardHeader>
                                    <CardTitle>{category.title}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Accordion type="single" collapsible className="w-full">
                                        {category.questions.map((item, qIdx) => (
                                            <AccordionItem key={qIdx} value={`item-${idx}-${qIdx}`}>
                                                <AccordionTrigger className="text-left">
                                                    {item.q}
                                                </AccordionTrigger>
                                                <AccordionContent className="text-muted-foreground">
                                                    {item.a}
                                                </AccordionContent>
                                            </AccordionItem>
                                        ))}
                                    </Accordion>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>

                {/* Contact Support */}
                <Card className="mt-12">
                    <CardHeader>
                        <CardTitle>Still Need Help?</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground mb-6">
                            Can't find what you're looking for? Our support team is here to help!
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Button variant="outline" asChild className="h-auto py-4">
                                <Link href="/contact">
                                    <div className="flex flex-col items-center gap-2">
                                        <Mail className="h-6 w-6" />
                                        <span className="font-semibold">Email Us</span>
                                        <span className="text-xs text-muted-foreground">support@zerorentals.com</span>
                                    </div>
                                </Link>
                            </Button>

                            <Button variant="outline" className="h-auto py-4">
                                <div className="flex flex-col items-center gap-2">
                                    <Phone className="h-6 w-6" />
                                    <span className="font-semibold">Call Us</span>
                                    <span className="text-xs text-muted-foreground">+91 98765 43210</span>
                                </div>
                            </Button>

                            <Button variant="outline" className="h-auto py-4">
                                <div className="flex flex-col items-center gap-2">
                                    <MessageCircle className="h-6 w-6" />
                                    <span className="font-semibold">Live Chat</span>
                                    <span className="text-xs text-muted-foreground">Mon-Fri, 9 AM - 6 PM</span>
                                </div>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
