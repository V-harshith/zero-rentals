"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Mail, Phone, Send, ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"

export default function ContactPage() {
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        phone: "",
        subject: "",
        message: ""
    })
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // Validation
        if (!formData.name || !formData.email || !formData.subject || !formData.message) {
            toast.error("Please fill in all required fields")
            return
        }

        setIsSubmitting(true)

        try {
            const response = await fetch("/api/contact", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(formData),
            })

            const data = await response.json()

            if (response.ok) {
                toast.success("Message sent successfully! We'll get back to you soon.")
                setFormData({
                    name: "",
                    email: "",
                    phone: "",
                    subject: "",
                    message: ""
                })
            } else {
                toast.error(data.error || "Failed to send message. Please try again.")
            }
        } catch (error) {
            console.error("Contact form error:", error)
            toast.error("Something went wrong. Please try again later.")
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        })
    }

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
                                Contact Us
                            </h1>
                            <p className="text-lg md:text-xl text-primary-foreground/90 max-w-2xl mx-auto">
                                Have questions? We'd love to hear from you. Send us a message and we'll respond as soon as possible.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Contact Section */}
                <section className="py-16 md:py-20">
                    <div className="container mx-auto px-4">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
                            {/* Contact Information */}
                            <div className="lg:col-span-1 space-y-6">
                                <div>
                                    <h2 className="text-2xl font-bold mb-6">Get in Touch</h2>
                                    <p className="text-muted-foreground mb-8">
                                        Feel free to reach out to us through any of the following channels.
                                    </p>
                                </div>

                                <Card className="border-2">
                                    <CardContent className="p-6 space-y-6">
                                        <div className="flex items-start gap-4">
                                            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                                                <Mail className="h-6 w-6 text-primary" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold mb-1">Email</h3>
                                                <a href="mailto:Info@zerorentals.com" className="text-muted-foreground hover:text-primary">
                                                    Info@zerorentals.com
                                                </a>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-4">
                                            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                                                <Phone className="h-6 w-6 text-primary" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold mb-1">Phone</h3>
                                                <a href="tel:+919880414637" className="text-muted-foreground hover:text-primary">
                                                    9880414637
                                                </a>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Contact Form */}
                            <div className="lg:col-span-2">
                                <Card className="border-2">
                                    <CardContent className="p-6 md:p-8">
                                        <h2 className="text-2xl font-bold mb-6">Send us a Message</h2>

                                        <form onSubmit={handleSubmit} className="space-y-6">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <label htmlFor="name" className="text-sm font-semibold">
                                                        Name <span className="text-destructive">*</span>
                                                    </label>
                                                    <Input
                                                        id="name"
                                                        name="name"
                                                        placeholder="Your full name"
                                                        value={formData.name}
                                                        onChange={handleChange}
                                                        required
                                                        className="h-12"
                                                    />
                                                </div>

                                                <div className="space-y-2">
                                                    <label htmlFor="email" className="text-sm font-semibold">
                                                        Email <span className="text-destructive">*</span>
                                                    </label>
                                                    <Input
                                                        id="email"
                                                        name="email"
                                                        type="email"
                                                        placeholder="your.email@example.com"
                                                        value={formData.email}
                                                        onChange={handleChange}
                                                        required
                                                        className="h-12"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <label htmlFor="phone" className="text-sm font-semibold">
                                                        Phone (Optional)
                                                    </label>
                                                    <Input
                                                        id="phone"
                                                        name="phone"
                                                        type="tel"
                                                        placeholder="+91 12345 67890"
                                                        value={formData.phone}
                                                        onChange={handleChange}
                                                        className="h-12"
                                                    />
                                                </div>

                                                <div className="space-y-2">
                                                    <label htmlFor="subject" className="text-sm font-semibold">
                                                        Subject <span className="text-destructive">*</span>
                                                    </label>
                                                    <Input
                                                        id="subject"
                                                        name="subject"
                                                        placeholder="How can we help?"
                                                        value={formData.subject}
                                                        onChange={handleChange}
                                                        required
                                                        className="h-12"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label htmlFor="message" className="text-sm font-semibold">
                                                    Message <span className="text-destructive">*</span>
                                                </label>
                                                <Textarea
                                                    id="message"
                                                    name="message"
                                                    placeholder="Tell us more about your inquiry..."
                                                    value={formData.message}
                                                    onChange={handleChange}
                                                    required
                                                    rows={6}
                                                    className="resize-none"
                                                />
                                            </div>

                                            <Button
                                                type="submit"
                                                size="lg"
                                                className="w-full md:w-auto"
                                                disabled={isSubmitting}
                                            >
                                                {isSubmitting ? (
                                                    <>
                                                        <span className="animate-spin mr-2">⏳</span>
                                                        Sending...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Send className="h-5 w-5 mr-2" />
                                                        Send Message
                                                    </>
                                                )}
                                            </Button>
                                        </form>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    )
}
