import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Post Your Property",
  description: "List your PG, co-living space, or rental property on ZeroRentals for free. Reach thousands of tenants looking for accommodations in your area.",
  openGraph: {
    title: "Post Your Property | ZeroRentals",
    description: "List your PG or rental property for free. Reach thousands of tenants in your area.",
    type: "website",
  },
}

export default function PostPropertyLayout({ children }: { children: React.ReactNode }) {
  return children
}
