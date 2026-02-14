"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Home, Shield, Users, TrendingUp, CheckCircle, ArrowLeft, MapPin } from "lucide-react"
import Link from "next/link"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"

const FEATURES = [
    {
        icon: Shield,
        title: "Verified Listings",
        description: "All properties are verified by our team to ensure quality and authenticity"
    },
    {
        icon: Users,
        title: "Trusted Community",
        description: "Join thousands of satisfied tenants and property owners"
    },
    {
        icon: MapPin,
        title: "Prime Locations",
        description: "Properties in the best neighborhoods across major cities"
    },
    {
        icon: TrendingUp,
        title: "Easy Management",
        description: "Simple dashboard to manage your properties and inquiries"
    }
]

const STATS = [
    { value: "10,000+", label: "Properties Listed" },
    { value: "50,000+", label: "Happy Tenants" },
    { value: "5,000+", label: "Property Owners" },
    { value: "25+", label: "Cities Covered" }
]

const VALUES = [
    "Transparency in all transactions",
    "Quality over quantity",
    "Customer satisfaction first",
    "Innovation in property rental",
    "Building lasting relationships"
]

export default function AboutPage() {
    return (
        <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-1">
                {/* Hero Section */}
                <section className="bg-primary text-primary-foreground py-16 md:py-20 relative">
                    <div className="container mx-auto px-4">
                        <div className="mb-8">
                            <Link
                                href="/"
                                className="inline-flex items-center gap-2 text-primary-foreground/80 hover:text-primary-foreground transition-colors group"
                            >
                                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                                <span>Back to Home</span>
                            </Link>
                        </div>
                        <div className="max-w-4xl mx-auto text-center space-y-6 animate-fadeIn">
                            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold">
                                About ZeroRentals
                            </h1>
                            <p className="text-lg md:text-xl text-primary-foreground/90 max-w-2xl mx-auto">
                                Revolutionizing the way people find and manage rental properties across India
                            </p>
                        </div>
                    </div>
                </section>

                {/* Mission Section */}
                <section className="py-16 md:py-20 bg-muted/30">
                    <div className="container mx-auto px-4">
                        <div className="max-w-4xl mx-auto text-center space-y-6">
                            <h2 className="text-3xl md:text-4xl font-bold">Our Mission</h2>
                            <p className="text-lg text-muted-foreground leading-relaxed">
                                At ZeroRentals, we're committed to making property rental simple, transparent, and hassle-free.
                                We connect property seekers with verified listings, ensuring a smooth experience for both tenants
                                and property owners. Our platform eliminates the traditional pain points of property hunting by
                                providing a trusted, efficient, and user-friendly solution.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Features Section */}
                <section className="py-16 md:py-20">
                    <div className="container mx-auto px-4">
                        <div className="text-center mb-12">
                            <h2 className="text-3xl md:text-4xl font-bold mb-4">Why Choose Us</h2>
                            <p className="text-lg text-muted-foreground">
                                We provide the best platform for your rental needs
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {FEATURES.map((feature, index) => (
                                <Card
                                    key={index}
                                    className="border-2 hover:border-primary/50 transition-all hover:shadow-lg animate-slideUp"
                                    style={{ animationDelay: `${index * 0.1}s` }}
                                >
                                    <CardContent className="p-6 text-center space-y-4">
                                        <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                                            <feature.icon className="h-8 w-8 text-primary" />
                                        </div>
                                        <h3 className="text-xl font-semibold">{feature.title}</h3>
                                        <p className="text-muted-foreground">{feature.description}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Stats Section */}
                <section className="py-16 md:py-20 bg-primary text-primary-foreground">
                    <div className="container mx-auto px-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                            {STATS.map((stat, index) => (
                                <div
                                    key={index}
                                    className="text-center animate-scaleIn"
                                    style={{ animationDelay: `${index * 0.1}s` }}
                                >
                                    <div className="text-4xl md:text-5xl font-bold mb-2">{stat.value}</div>
                                    <div className="text-primary-foreground/80">{stat.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Values Section */}
                <section className="py-16 md:py-20">
                    <div className="container mx-auto px-4">
                        <div className="max-w-3xl mx-auto">
                            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">Our Values</h2>
                            <div className="space-y-4">
                                {VALUES.map((value, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 animate-slideUp"
                                        style={{ animationDelay: `${index * 0.1}s` }}
                                    >
                                        <CheckCircle className="h-6 w-6 text-primary flex-shrink-0" />
                                        <span className="text-lg">{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* CTA Section */}
                <section className="py-16 md:py-20 bg-muted/30">
                    <div className="container mx-auto px-4">
                        <div className="max-w-3xl mx-auto text-center space-y-6">
                            <h2 className="text-3xl md:text-4xl font-bold">Ready to Get Started?</h2>
                            <p className="text-lg text-muted-foreground">
                                Join thousands of satisfied users and find your perfect rental property today
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                <Button asChild size="lg" className="bg-primary hover:bg-primary/90">
                                    <Link href="/">Browse Properties</Link>
                                </Button>
                                <Button asChild size="lg" variant="outline">
                                    <Link href="/contact">Contact Us</Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    )
}
