import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "PG Accommodations",
  description: "Browse verified PG accommodations across India. Find affordable single, double, and triple sharing rooms with amenities like WiFi, meals, and AC.",
  openGraph: {
    title: "PG Accommodations | ZeroRentals",
    description: "Browse verified PG accommodations across India. Affordable rooms with great amenities.",
    type: "website",
  },
}

export default function PGLayout({ children }: { children: React.ReactNode }) {
  return children
}
