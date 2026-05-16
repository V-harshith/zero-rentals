import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Help Center",
  description: "Find answers to frequently asked questions about ZeroRentals. Learn how to search properties, list your PG, manage bookings, and more.",
  openGraph: {
    title: "Help Center | ZeroRentals",
    description: "Find answers to frequently asked questions about ZeroRentals.",
    type: "website",
  },
}

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children
}
