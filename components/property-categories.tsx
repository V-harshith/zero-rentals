"use client"

import { motion } from "framer-motion"
import { Users, Bed, Building2, Star, GraduationCap, Briefcase } from "lucide-react"

const CATEGORIES = [
  {
    title: "PG Accommodations",
    description: "Affordable stays with food & amenities",
    icon: Bed,
    image: "/cozy-bedroom-with-workspace.jpg",
    color: "bg-blue-500",
  },
  {
    title: "Co-Living Spaces",
    description: "Modern living driven by community",
    icon: Users,
    image: "/modern-residential-apartment-building.jpg",
    color: "bg-purple-500",
  },
  {
    title: "Rental Homes",
    description: "Move-in ready apartments & flats",
    icon: Building2,
    image: "/modern-office-building.png",
    color: "bg-emerald-500",
  },
  {
    title: "Luxury Suites",
    description: "Premium living with elite services",
    icon: Star,
    image: "/modern-single-bedroom.jpg",
    color: "bg-amber-500",
  },
  {
    title: "Student Housing",
    description: "Vibrant spaces near top campuses",
    icon: GraduationCap,
    image: "/students-studying.png",
    color: "bg-rose-500",
  },
  {
    title: "Executive Stays",
    description: "Corporate-ready professional living",
    icon: Briefcase,
    image: "/professional-working-at-desk.jpg",
    color: "bg-indigo-500",
  },
]

export function PropertyCategories() {
  return (
    <section className="py-20 md:py-32 bg-white relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-30">
        <div className="absolute -top-[10%] -right-[5%] w-[500px] h-[500px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-[10%] -left-[5%] w-[400px] h-[400px] rounded-full bg-blue-500/10 blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-3xl mx-auto text-center mb-16 space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
              Explore by <span className="text-primary">Category</span>
            </h2>
            <p className="text-xl text-muted-foreground">
              Whether you need a single room or a full house, we have it all.
            </p>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {CATEGORIES.map((category, index) => {
            const Icon = category.icon
            return (
              <motion.div
                key={category.title}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                whileHover={{ y: -8 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="group h-full will-change-transform translate-z-0"
              >
                <div className="relative h-full min-h-[350px] sm:min-h-[400px] rounded-2xl sm:rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 cursor-default">
                  {/* Background Image */}
                  <div className="absolute inset-0">
                    <img
                      src={category.image}
                      alt={category.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent opacity-85 group-hover:opacity-80 transition-opacity" />
                  </div>

                  {/* Content */}
                  <div className="absolute inset-0 p-6 sm:p-8 flex flex-col justify-end">
                    <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl ${category.color} flex items-center justify-center mb-4 sm:mb-6 shadow-lg transform transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3`}>
                      <Icon className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                    </div>

                    <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2 sm:mb-3 group-hover:text-[#14FFEC] transition-colors">
                      {category.title}
                    </h3>

                    <p className="text-white/80 text-base sm:text-lg opacity-90 leading-relaxed transform transition-all duration-500 group-hover:translate-x-1">
                      {category.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
