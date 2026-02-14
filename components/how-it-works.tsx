"use client"

import { motion } from "framer-motion"
import { Search, MapPin, Lock, CheckCircle } from "lucide-react"

const STEPS = [
    {
        title: "Discover",
        description: "Explore curated listings across 15+ cities. Smart filters help you find your ideal space instantly.",
        icon: Search,
        color: "bg-blue-500",
    },
    {
        title: "Experience",
        description: "See it your way. Schedule an in-person visit instantly.",
        icon: MapPin,
        color: "bg-purple-500",
    },
    {
        title: "Secure",
        description: "Found the one? Lock it down with Zero token payment. No bidding wars, no uncertainty.",
        icon: Lock,
        color: "bg-emerald-500",
    },
    {
        title: "Move-In",
        description: "Sign digital rent agreements and enjoy your zero-brokerage home.",
        icon: CheckCircle,
        color: "bg-orange-500",
    },
]

export function HowItWorks() {
    return (
        <section className="py-24 md:py-32 bg-gray-50/50 overflow-hidden">
            <div className="container mx-auto px-4">
                <div className="text-center max-w-2xl mx-auto mb-20 space-y-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary font-bold text-xs uppercase tracking-widest"
                    >
                        How it works
                    </motion.div>
                    <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900">
                        Get Started in <span className="text-primary italic">4 Simple Steps</span>
                    </h2>
                    <p className="text-xl text-gray-600">
                        Finding your next home shouldn't be a part-time job. We've simplified the entire process.
                    </p>
                </div>

                <div className="relative">
                    {/* Connector Line (Desktop) */}
                    <div className="hidden lg:block absolute top-10 left-0 w-full h-0.5 bg-gray-200 z-0"></div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 relative z-10">
                        {STEPS.map((step, index) => {
                            const Icon = step.icon
                            return (
                                <motion.div
                                    key={step.title}
                                    initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.6, delay: index * 0.1 }}
                                    className="relative group"
                                >
                                    <div className="flex flex-col items-center">
                                        <div className={`w-20 h-20 rounded-3xl ${step.color} shadow-lg flex items-center justify-center mb-8 relative ring-8 ring-white group-hover:rotate-6 transition-transform duration-500`}>
                                            <Icon className="h-10 w-10 text-white" />
                                            <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center font-bold text-gray-900">
                                                {index + 1}
                                            </div>
                                        </div>
                                        <h3 className="text-2xl font-bold text-gray-900 mb-3">{step.title}</h3>
                                        <p className="text-gray-600 text-center leading-relaxed">
                                            {step.description}
                                        </p>
                                    </div>
                                </motion.div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </section>
    )
}
