import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Handpicked PGs",
  description: "Curated collection of the best PG accommodations, personally selected by our team for quality, location, and value. Verified and trusted listings only.",
  openGraph: {
    title: "Handpicked PGs | ZeroRentals",
    description: "Curated collection of the best PG accommodations, personally selected for quality and value.",
    type: "website",
  },
}

export default function HandpickedPGsLayout({ children }: { children: React.ReactNode }) {
  return children
}
