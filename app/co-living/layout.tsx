import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Co-Living Spaces",
  description: "Discover modern co-living spaces across India. Fully furnished rooms with community amenities, high-speed WiFi, and flexible lease terms.",
  openGraph: {
    title: "Co-Living Spaces | ZeroRentals",
    description: "Discover modern co-living spaces across India with community amenities and flexible terms.",
    type: "website",
  },
}

export default function CoLivingLayout({ children }: { children: React.ReactNode }) {
  return children
}
