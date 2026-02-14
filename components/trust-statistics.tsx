"use client"

import { motion } from "framer-motion"
import { ShieldCheck, Users, MapPin, BadgePercent } from "lucide-react"

const STATS = [
    {
        label: "Verified Listings",
        value: "5,000+",
        icon: ShieldCheck,
        description: "Every property personally checked",
        color: "text-blue-600",
        bg: "bg-blue-50",
    },
    {
        label: "Happy Tenants",
        value: "50,000+",
        icon: Users,
        description: "Finding homes they love daily",
        color: "text-purple-600",
        bg: "bg-purple-50",
    },
    {
        label: "Cities Covered",
        value: "15+",
        icon: MapPin,
        description: "Across major metros in India",
        color: "text-emerald-600",
        bg: "bg-emerald-50",
    },
    {
        label: "Brokerage Saved",
        value: "₹0",
        icon: BadgePercent,
        description: "No hidden charges, ever",
        color: "text-orange-600",
        bg: "bg-orange-50",
    },
]

export function TrustStatistics() {
    return (
        <section className="py-16 md:py-24 bg-white border-y border-gray-100">
            <div className="container mx-auto px-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                    {STATS.map((stat, index) => {
                        const Icon = stat.icon
                        return (
                            <motion.div
                                key={stat.label}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: index * 0.1 }}
                                className="flex flex-col items-center text-center p-6 rounded-3xl transition-all duration-300 hover:shadow-xl hover:bg-gray-50/50 group"
                            >
                                <div className={`w-16 h-16 rounded-2xl ${stat.bg} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500`}>
                                    <Icon className={`h-8 w-8 ${stat.color}`} />
                                </div>
                                <h4 className="text-4xl font-extrabold text-gray-900 mb-2">{stat.value}</h4>
                                <p className="text-lg font-bold text-gray-800 mb-1">{stat.label}</p>
                                <p className="text-sm text-gray-500 leading-relaxed max-w-[200px]">{stat.description}</p>
                            </motion.div>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}
