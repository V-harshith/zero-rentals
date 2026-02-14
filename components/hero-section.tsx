"use client"

import { motion } from "framer-motion"
import { ComprehensiveSearchBar } from "@/components/comprehensive-search-bar"
import { Star } from "lucide-react"

export function HeroSection() {
  return (
    <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden py-16 md:py-24">
      {/* Immersive Background Layers - Optimized for Performance */}
      <div className="absolute inset-0 z-0 bg-[#0d7377]">
        <div className="absolute inset-0 opacity-40">
          <motion.div
            animate={{
              x: [0, 20, 0],
              y: [0, 15, 0]
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            className="absolute top-[-5%] left-[-5%] w-[400px] h-[400px] bg-[#14FFEC]/20 rounded-full blur-[80px] will-change-transform translate-z-0"
          />
          <motion.div
            animate={{
              x: [0, -20, 0],
              y: [0, -15, 0]
            }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-[-5%] right-[-5%] w-[350px] h-[350px] bg-orange-500/15 rounded-full blur-[70px] will-change-transform translate-z-0"
          />
        </div>
        <div className="absolute inset-0 bg-black/10" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white to-transparent" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-5xl mx-auto text-center space-y-8 md:space-y-12">
          {/* Badge & Text Content */}
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-xs sm:text-sm font-medium"
            >
              <div className="flex -space-x-1">
                {[
                  { bg: "bg-blue-500", initial: "A" },
                  { bg: "bg-green-500", initial: "R" },
                  { bg: "bg-purple-500", initial: "S" }
                ].map((avatar, i) => (
                  <div key={i} className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 border-primary ${avatar.bg} flex items-center justify-center overflow-hidden`}>
                    <span className="text-[8px] sm:text-[10px] font-bold text-white">{avatar.initial}</span>
                  </div>
                ))}
              </div>
              <span className="whitespace-nowrap">Trusted by 50,000+ tenants</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="space-y-4 md:space-y-6"
            >
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-white tracking-tight leading-[1.1] sm:leading-tight">
                Find Your Perfect <br className="hidden sm:block" />
                <motion.span
                  className="text-transparent bg-clip-text bg-gradient-to-r from-white via-[#14FFEC] to-white inline-block relative"
                  animate={{
                    backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                    y: [0, -5, 0]
                  }}
                  transition={{
                    backgroundPosition: { duration: 5, repeat: Infinity, ease: "linear" },
                    y: { duration: 3, repeat: Infinity, ease: "easeInOut" }
                  }}
                  style={{ backgroundSize: "200% auto" }}
                >
                  Space in India
                </motion.span>
              </h1>
              <p className="text-lg sm:text-xl md:text-2xl text-white/80 max-w-2xl mx-auto font-medium px-4">
                Premium PGs, Co-living spaces, and Rental homes with <span className="font-bold text-[#14FFEC]">ZERO BROKERAGE</span>.
              </p>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="relative"
          >
            {/* Background Glow for Search Bar */}
            <div className="absolute -inset-4 bg-white/5 blur-3xl rounded-full" />
            <ComprehensiveSearchBar className="relative z-20" />
          </motion.div>
        </div>
      </div>
    </section>
  )
}

