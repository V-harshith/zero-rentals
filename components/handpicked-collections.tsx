"use client"

import { motion } from "framer-motion"

const COLLECTIONS = [
  {
    title: "Gym & Fitness",
    description: "Stay fit and healthy",
    image: "/gym-facility.png",
  },
  {
    title: "Fully Furnished",
    description: "Move-in ready spaces",
    image: "/fully-furnished-room.png",
  },
  {
    title: "24/7 Security",
    description: "Safe & secure living",
    image: "/security-entrance.png",
  },
  {
    title: "Power Backup",
    description: "Uninterrupted power supply",
    image: "/power-backup.png",
  },
  {
    title: "WiFi Included",
    description: "High-speed internet 24/7",
    image: "/laptop-coffee-wifi-work.jpg",
  },
  {
    title: "Meals Included",
    description: "Homely food served daily",
    image: "/healthy-indian-food-plate.jpg",
  },
]

export function HandpickedCollections() {
  return (
    <section className="py-20 md:py-32 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="h-1 w-10 bg-primary rounded-full"></span>
              <span className="text-primary font-bold uppercase tracking-wider text-sm">Curated For You</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight">
              Handpicked <br className="hidden md:block" /> Collections
            </h2>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg text-gray-600 max-w-md"
          >
            Discover our most popular categories, specifically curated to match your lifestyle and budget.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {COLLECTIONS.map((collection, index) => (
            <motion.div
              key={collection.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              whileHover={{ scale: 1.02, y: -5 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="group relative rounded-3xl overflow-hidden h-72 shadow-lg cursor-default"
            >
              <div className="absolute inset-0">
                <img
                  src={collection.image}
                  alt={collection.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-90 group-hover:opacity-85 transition-opacity" />
              </div>

              <div className="absolute inset-0 p-6 flex flex-col justify-end">
                <h3 className="text-2xl font-bold text-white mb-1 transform transition-transform duration-300 group-hover:-translate-y-1">{collection.title}</h3>
                <p className="text-white/80 font-medium transform transition-transform duration-300 group-hover:-translate-y-1">{collection.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
