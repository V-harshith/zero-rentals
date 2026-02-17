"use client"

import Link from "next/link"
import Image from "next/image"
import { useAuth } from "@/lib/auth-context"
import { usePathname } from "next/navigation"

const PROPERTY_LINKS = ["New Delhi", "Mumbai", "Chennai", "Pune", "Noida", "Gurgaon", "Bangalore", "Ahmedabad"]

const PG_CITIES = ["New Delhi", "Mumbai", "Chennai", "Pune", "Noida", "Gurgaon", "Bangalore", "Ahmedabad"]

export function Footer() {
  const { user } = useAuth()
  const pathname = usePathname()

  // Check if user is a tenant
  const isTenant = user?.role === "tenant"
  // Check if user is an owner
  const isOwner = user?.role === "owner"
  // Check if user is logged in
  const isLoggedIn = !!user

  // Only show favorites on home page and explore pages for tenants
  const showFavorites = isTenant && (pathname === "/" || pathname?.startsWith("/search") || pathname?.startsWith("/pg") || pathname?.startsWith("/coliving") || pathname?.startsWith("/rent"))

  return (
    <footer className="bg-gray-900 text-white border-t border-gray-800">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Image src="/zerorentals-logo.png" alt="ZeroRentals" width={32} height={32} />
              </div>
              <span className="font-bold text-2xl tracking-tight">ZeroRentals</span>
            </div>
            <p className="text-gray-400 leading-relaxed">
              India&apos;s premium tech-enabled platform for frictionless living. We connect modern renters with verified spaces through a seamless, zero-brokerage experience.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-6">Explore Our Spaces</h3>
            <div className="space-y-4">
              <Link href="/pg" className="block text-gray-400 hover:text-primary transition-colors">PG Accommodations</Link>
              <Link href="/co-living" className="block text-gray-400 hover:text-primary transition-colors">Co-living Spaces</Link>
              <Link href="/rent" className="block text-gray-400 hover:text-primary transition-colors">Rental Homes</Link>
            </div>
          </div>

          {/* Only show For Owners section to owners or non-logged in users (not to tenants) */}
          {(!isLoggedIn || isOwner) && (
            <div>
              <h3 className="font-bold text-lg mb-6">For Owners</h3>
              <div className="space-y-4">
                <Link href="/post-property" className="block text-gray-400 hover:text-primary transition-colors">List Your Property</Link>
                <Link href="/login/owner" className="block text-gray-400 hover:text-primary transition-colors">Owner Dashboard</Link>
                <Link href="/pricing" className="block text-gray-400 hover:text-primary transition-colors">Upgrade Plan</Link>
                <Link href="/about" className="block text-gray-400 hover:text-primary transition-colors">About Us</Link>
              </div>
            </div>
          )}

          {/* For tenants, show a different column with favorites */}
          {isTenant && (
            <div>
              <h3 className="font-bold text-lg mb-6">Quick Links</h3>
              <div className="space-y-4">
                <Link href="/dashboard/tenant/favorites" className="block text-gray-400 hover:text-primary transition-colors">Your Favorites</Link>
                <Link href="/dashboard/tenant" className="block text-gray-400 hover:text-primary transition-colors">Dashboard</Link>
                <Link href="/help" className="block text-gray-400 hover:text-primary transition-colors">Help Center</Link>
                <Link href="/contact" className="block text-gray-400 hover:text-primary transition-colors">Contact Us</Link>
              </div>
            </div>
          )}

          {/* For non-logged in users, show support section */}
          {!isLoggedIn && (
            <div>
              <h3 className="font-bold text-lg mb-6">Support</h3>
              <div className="space-y-4">
                <Link href="/help" className="block text-gray-400 hover:text-primary transition-colors">Help Center</Link>
                <Link href="/contact" className="block text-gray-400 hover:text-primary transition-colors">Contact Us</Link>
              </div>
            </div>
          )}
        </div>

        <div className="pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-wrap gap-8 text-sm text-gray-400">
            <Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
            <Link href="/refund" className="hover:text-primary transition-colors">Refund Policy</Link>
          </div>
          <p className="text-gray-500 text-sm">© 2026 ZeroRentals. Engineered for Excellence.</p>
        </div>
      </div>
    </footer>
  )
}
