import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "About Us",
  description: "ZeroRentals is India's trusted platform for finding verified PG accommodations, co-living spaces, and rental properties. Learn about our mission to simplify house hunting.",
  openGraph: {
    title: "About ZeroRentals",
    description: "India's trusted platform for verified PG accommodations, co-living spaces, and rental properties.",
    type: "website",
  },
}

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children
}
