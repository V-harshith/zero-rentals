import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Featured PGs",
  description: "Explore our handpicked featured PG accommodations. Premium verified listings with top amenities, great locations, and trusted owners.",
  openGraph: {
    title: "Featured PGs | ZeroRentals",
    description: "Explore handpicked featured PG accommodations with top amenities and great locations.",
    type: "website",
  },
}

export default function FeaturedPGsLayout({ children }: { children: React.ReactNode }) {
  return children
}
